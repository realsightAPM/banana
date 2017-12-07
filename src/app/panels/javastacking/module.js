/*

  ## Histogram

  ### Parameters
  * auto_int :: Auto calculate data point interval?
  * resolution ::  If auto_int is enables, shoot for this many data points, rounding to
                    sane intervals
  * interval :: Datapoint interval in elasticsearch date math format (eg 1d, 1w, 1y, 5y)
  * fill :: Only applies to line charts. Level of area shading from 0-10
  * linewidth ::  Only applies to line charts. How thick the line should be in pixels
                  While the editor only exposes 0-10, this can be any numeric value.
                  Set to 0 and you'll get something like a scatter plot
  * timezone :: This isn't totally functional yet. Currently only supports browser and utc.
                browser will adjust the x-axis labels to match the timezone of the user's
                browser
  * spyable ::  Dislay the 'eye' icon that show the last elasticsearch query
  * zoomlinks :: Show the zoom links?
  * bars :: Show bars in the chart
  * stack :: Stack multiple queries. This generally a crappy way to represent things.
             You probably should just use a line chart without stacking
  * points :: Should circles at the data points on the chart
  * lines :: Line chart? Sweet.
  * legend :: Show the legend?
  * x-axis :: Show x-axis labels and grid lines
  * y-axis :: Show y-axis labels and grid lines
  * interactive :: Allow drag to select time range

*/
define([
  'angular',
  'app',
  'jquery',
  'underscore',
  'kbn',
  'moment',
  './timeSeries',
    'echarts-liquidfill'

  
],
function (angular, app, $, _, kbn, moment, timeSeries) {
  'use strict';
  var module = angular.module('kibana.panels.stacking', []);
  app.useModule(module);

  module.controller('javastacking', function($scope, $translate,$q, querySrv, dashboard, filterSrv) {
    $scope.panelMeta = {

      editorTabs : [
        {
          title:$translate.instant('Queries'),
          src:'app/partials/querySelect.html'
        }
      ],
      status  : "Stable",
      description : ""
    };

    // Set and populate defaults
    var _d = {
      panelExpand:true,
      fullHeight:'700%',
      useInitHeight:true,
      mode        : 'value',
      queries     : {
        mode        : 'all',
        ids         : [],
        query       : '*:*',
        custom      : ''
      },
      max_rows    : 100000,  // maximum number of rows returned from Solr (also use this for group.limit to simplify UI setting)
      reverse     :0,
	  segment	  :4,
	  threshold_first:1000,
	  threshold_second:2000,
	  threshold_third:3000,
	  value_field : 'jvm hostname os appserver arguments javaversion',
      group_field : null,
      auto_int    : true,
      figuresize:50,
      fontsize : 20,
	  isEN:false,
      resolution  : 100,
	  value_sort  :'rs_timestamp',
      interval    : '5m',
      intervals   : ['auto','1s','1m','5m','10m','30m','1h','3h','12h','1d','1w','1M','1y'],
	  chart       :'stacking',
	  chartColors :['#f48a52','#f4d352','#ccf452','#8cf452','#3cee2b','#f467d8','#1a93f9','#2fd7ee'],
      spyable     : true,
	  linkage     :false,
        display:'block',
        icon:"icon-caret-down",
        linkage_id:'a',
	    label : true,
      interactive : true,
      options     : true,
      show_queries:true,
      tooltip     : {
        value_type: 'cumulative',
        query_as_alias: false
      }
    };

    _.defaults($scope.panel,_d);

    $scope.init = function() {
      // Hide view options by default
      // $('.fullscreen-link').on('click', function () {
      //   var ibox = $(this).closest('div.ibox1');
      //   var button = $(this).find('i');
      //
      //   $('body').toggleClass('fullscreen-ibox1-mode');
      //   button.toggleClass('fa-expand').toggleClass('fa-compress');
      //   ibox.toggleClass('fullscreen');
      //   $scope.panel.useInitHeight=!$scope.panel.useInitHeight;
      //   $scope.$emit('render');
      //
      //   $(window).trigger('resize');
      //
      // });
      $scope.options = false;
      $scope.$on('refresh',function(){
        $scope.get_data();
      });

      $scope.get_data();

    };
    $scope.reSize=function() {

      $scope.panel.useInitHeight=!$scope.panel.useInitHeight;

      var ibox = $('#'+$scope.$id+'z').closest('div.ibox1');
      var button = $('#'+$scope.$id+'z').find('i');
      //var aaa = '#'+$scope.$id+'z';
      $('body').toggleClass('fullscreen-ibox1-mode');
      button.toggleClass('fa-expand').toggleClass('fa-compress');
      ibox.toggleClass('fullscreen');
      $scope.panel.fullHeight = ibox[0].offsetHeight-60;
      $scope.$emit('render');
      $(window).trigger('resize');


    };

    //快捷键+控制放大缩小panel
    $scope.zoomOut=function() {
      if(window.event.keyCode===107){
        $scope.reSize();
      }


    };
    $scope.set_interval = function(interval) {
      if(interval !== 'auto') {
        $scope.panel.auto_int = false;
        $scope.panel.interval = interval;
      } else {
        $scope.panel.auto_int = true;
      }
    };

      $scope.display=function() {
          if($scope.panel.display === 'none'){
              $scope.panel.display='block';
              $scope.panel.icon="icon-caret-down";
          }else{
              $scope.panel.display='none';
              $scope.panel.icon="icon-caret-up";
          }
      };

    $scope.interval_label = function(interval) {
      return $scope.panel.auto_int && interval === $scope.panel.interval ? interval+" (auto)" : interval;
    };

    /**
     * The time range effecting the panel
     * @return {[type]} [description]
     */
    $scope.get_time_range = function () {
      var range = $scope.range = filterSrv.timeRange('min');
      return range;
    };

    $scope.get_interval = function () {
      var interval = $scope.panel.interval,
                      range;
      if ($scope.panel.auto_int) {
        range = $scope.get_time_range();
        if (range) {
          interval = kbn.secondsToHms(
            kbn.calculate_interval(range.from, range.to, $scope.panel.resolution, 0) / 1000
          );
        }
      }
      $scope.panel.interval = interval || '10m';
      return $scope.panel.interval;
    };

    /**
     * Fetch the data for a chunk of a queries results. Multiple segments occur when several indicies
     * need to be consulted (like timestamped logstash indicies)
     *
     * The results of this function are stored on the scope's data property. This property will be an
     * array of objects with the properties info, time_series, and hits. These objects are used in the
     * render_panel function to create the historgram.
     *
     * !!! Solr does not need to fetch the data in chunk because it uses a facet search and retrieve
     * !!! all events from a single query.
     *
     * @param {number} segment   The segment count, (0 based)
     * @param {number} query_id  The id of the query, generated on the first run and passed back when
     *                            this call is made recursively for more segments
     */
    $scope.get_data = function(segment, query_id) {
        if(($scope.panel.linkage_id === dashboard.current.linkage_id)||dashboard.current.enable_linkage){
        if (_.isUndefined(segment)) {
            segment = 0;
        }
        delete $scope.panel.error;

        // Make sure we have everything for the request to complete
        if (dashboard.indices.length === 0) {
            return;
        }
        var _range = $scope.get_time_range();
        var _interval = $scope.get_interval(_range);

        if ($scope.panel.auto_int) {
            $scope.panel.interval = kbn.secondsToHms(
                kbn.calculate_interval(_range.from, _range.to, $scope.panel.resolution, 0) / 1000);
        }

        $scope.panelMeta.loading = true;

        // Solr
        $scope.sjs.client.server(dashboard.current.solr.server + dashboard.current.solr.core_name);

        var request = $scope.sjs.Request().indices(dashboard.indices[segment]);
        $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);


        $scope.panel.queries.query = "";
        // Build the query
        _.each($scope.panel.queries.ids, function (id) {
            var query = $scope.sjs.FilteredQuery(
                querySrv.getEjsObj(id),
                filterSrv.getBoolFilter(filterSrv.ids)
            );

            var facet = $scope.sjs.DateHistogramFacet(id);
            if ($scope.panel.mode === 'count' || $scope.panel.mode === 'counts') {
                facet = facet.field(filterSrv.getTimeField());
            } else {
                if (_.isNull($scope.panel.value_field)) {
                    $scope.panel.error = "In " + $scope.panel.mode + " mode a field must be specified";
                    return;
                }
                facet = facet.keyField(filterSrv.getTimeField()).valueField($scope.panel.value_field);
            }
            facet = facet.interval(_interval).facetFilter($scope.sjs.QueryFilter(query));
            request = request.facet(facet).size(0);

        });

        // Populate the inspector panel
        $scope.populate_modal(request);

        // Build Solr query
        var fq = '';
        if (filterSrv.getSolrFq()) {
            fq = '&' + filterSrv.getSolrFq();
        }
        var time_field = filterSrv.getTimeField();
        var start_time = filterSrv.getStartTime();
        var end_time = filterSrv.getEndTime();

        // facet.range.end does NOT accept * as a value, need to convert it to NOW
        if (end_time === '*') {
            end_time = 'NOW';
        }

        var wt_json = '&wt=json';
        var sort_s = '&sort=' + $scope.panel.value_sort + '%20desc';
        var rows_limit = '&rows=0'; // for histogram, we do not need the actual response doc, so set rows=0
        var facet_gap = $scope.sjs.convertFacetGap($scope.panel.interval);
        var facet = '&facet=true' +
            '&facet.range=' + time_field +
            '&facet.range.start=' + start_time +
            '&facet.range.end=' + end_time +
            '&facet.range.gap=' + facet_gap;
        var values_mode_query = '';

        // For mode = value
        if ($scope.panel.mode === 'values' || $scope.panel.mode === 'value') {
            if (!$scope.panel.value_field) {
                $scope.panel.error = "In " + $scope.panel.mode + " mode a field must be specified";
                return;
            }
            values_mode_query = '&fl=' + time_field + ' ' + $scope.panel.value_field;

            rows_limit = '&rows=' + $scope.panel.max_rows;
            facet = '';

            // if Group By Field is specified
            if ($scope.panel.group_field) {
                values_mode_query += '&group=true&group.field=' + $scope.panel.group_field + '&group.limit=' + $scope.panel.max_rows;
            }
        }

        var mypromises = [];
        if ($scope.panel.mode === 'value' || $scope.panel.mode === 'counts') {
            var arr_id = [0];
            _.each(arr_id, function () {
                var temp_q = 'q=' + $scope.panel.value_field + '%3A%5B' + '*' + '%20TO%20' + '*' + '%5D' + wt_json + sort_s + rows_limit + fq + facet + values_mode_query;

                $scope.panel.queries.query += temp_q + "\n";
                if ($scope.panel.queries.custom !== null) {
                    request = request.setQuery(temp_q + $scope.panel.queries.custom);
                } else {
                    request = request.setQuery(temp_q);
                }
                mypromises.push(request.doSearch());
            });
        }
        $scope.data = [];

        if (dashboard.current.services.query.ids.length >= 1) {
            $q.all(mypromises).then(function (results) {
                $scope.panelMeta.loading = false;
                if (segment === 0) {
                    $scope.hits = 0;
                    $scope.data = [];
                    query_id = $scope.query_id = new Date().getTime();
                }
                // Convert facet ids to numbers
                // var facetIds = _.map(_.keys(results.facets),function(k){return parseInt(k, 10);});
                //var facetIds = [0]; // Need to fix this

                // Make sure we're still on the same query/queries
                // TODO: We probably DON'T NEED THIS unless we have to support multiple queries in query module.
                // if ($scope.query_id === query_id && _.difference(facetIds, $scope.panel.queries.ids).length === 0) {
                var i = 0,
                    time_series,
                    hits;

                _.each(arr_id, function (id, index) {
                    // Check for error and abort if found
                    if (!(_.isUndefined(results[index].error))) {
                        $scope.panel.error = $scope.parse_error(results[index].error.msg);
                        return;
                    }
                    // we need to initialize the data variable on the first run,
                    // and when we are working on the first segment of the data.
                    if (_.isUndefined($scope.data[i]) || segment === 0) {
                        time_series = new timeSeries.ZeroFilled({
                            interval: _interval,
                            start_date: _range && _range.from,
                            end_date: _range && _range.to,
                            fill_style: 'minimal'
                        });
                        hits = 0;
                    } else {
                        time_series = $scope.data[i].time_series;
                        // Bug fix for wrong event count:
                        //   Solr don't need to accumulate hits count since it can get total count from facet query.
                        //   Therefore, I need to set hits and $scope.hits to zero.
                        // hits = $scope.data[i].hits;
                        hits = 0;
                        $scope.hits = 0;
                    }

                    $scope.data[i] = results[index].response.docs;
                    i++;
                });

                // Tell the histogram directive to render.
                $scope.$emit('render');
                // }
            });
        }

    }
    };

    // function $scope.zoom
    // factor :: Zoom factor, so 0.5 = cuts timespan in half, 2 doubles timespan
    $scope.zoom = function(factor) {
      var _range = filterSrv.timeRange('min');
      var _timespan = (_range.to.valueOf() - _range.from.valueOf());
      var _center = _range.to.valueOf() - _timespan/2;

      var _to = (_center + (_timespan*factor)/2);
      var _from = (_center - (_timespan*factor)/2);

      // If we're not already looking into the future, don't.
      if(_to > Date.now() && _range.to < Date.now()) {
        var _offset = _to - Date.now();
        _from = _from - _offset;
        _to = Date.now();
      }

      var time_field = filterSrv.getTimeField();
      if(factor > 1) {
        filterSrv.removeByType('time');
      }

      filterSrv.set({
        type:'time',
        from:moment.utc(_from).toDate(),
        to:moment.utc(_to).toDate(),
        field:time_field
      });

      dashboard.refresh();
    };

    // I really don't like this function, too much dom manip. Break out into directive?
    $scope.populate_modal = function(request) {
      $scope.inspector = angular.toJson(JSON.parse(request.toString()),true);
    };

    $scope.set_refresh = function (state) {
      $scope.refresh = state;
    };

    $scope.close_edit = function() {
      if($scope.refresh) {
        $scope.get_data();
      }
      $scope.refresh =  false;
      $scope.$emit('render');
    };

    $scope.render = function() {
      $scope.$emit('render');
    };

  });

   module.directive('javastackingChart', function(querySrv,dashboard,filterSrv) {
    return {
      restrict: 'A',
      link: function(scope, elem) {
        var myChart;
        // Receive render events
        scope.$on('render',function(){
          render_panel();
        });

        // Re-render if the window is resized
        angular.element(window).bind('resize', function(){
          render_panel();
        });

        // Function for rendering panel
        function render_panel() {
          var chartData;
          var colors = [];

          // IE doesn't work without this
          var divHeight=scope.panel.height||scope.row.height;
          if(!scope.panel.useInitHeight){
            divHeight = scope.panel.fullHeight;
          }
          elem.css({height:divHeight});

          // Make a clone we can operate on.
		  
          chartData = _.clone(scope.data);
          chartData = scope.panel.missing ? chartData :
            _.without(chartData,_.findWhere(chartData,{meta:'missing'}));
          chartData = scope.panel.other ? chartData :
          _.without(chartData,_.findWhere(chartData,{meta:'other'}));

          if (filterSrv.idsByTypeAndField('terms',scope.panel.field).length > 0) {
            colors.push(scope.panel.lastColor);
          } else {
            colors = scope.panel.chartColors;
          }

          var idd = scope.$id;
          require(['echarts'], function(ec){
              var echarts = ec;


				  var labelcolor = false;
          if (dashboard.current.style === 'dark'){
            labelcolor = true;
          }
              // Add plot to scope so we can build out own legend
          if(scope.panel.chart === 'stacking') {
            if(myChart) {
              myChart.dispose();
            }
            myChart = echarts.init(document.getElementById(idd));
            var option = {

              series: [{
                animation: true,
                waveAnimation: true,
                itemStyle: {
                  normal: {
                    shadowBlur: 0
                  }
                },
                center: ['50%', '25%'],
                radius: scope.panel.figuresize+'%',
                backgroundStyle: {
                  color: 'none',
                  borderColor: '#696969',
                  borderWidth: 1
                },
                type: 'liquidFill',
                shape:"path://M746.762 175.536c-29.661 20.894-58.555 38.684-90.296 64.505-23.997 19.615-67.321 46.428-69.657 82.553-3.616 54.939 81.016 105.75 36.125 175.407-17.023 26.558-45.916 37.917-82.553 54.171-4.383-7.999 9.535-14.718 15.487-23.23 56.25-81.528-58.555-108.597-43.868-208.94 14.175-96.983 128.468-130.804 234.762-144.466zM388.204 510.864c-26.558 12.383-70.938 14.719-90.296 41.276 19.614 14.719 48.252 14.175 74.81 15.487 108.853 4.895 245.064-4.384 337.92-20.638 3.103 6.72-12.895 18.302-23.23 25.79-58.555 42.811-240.682 54.938-366.302 46.427-42.044-2.848-138.26-13.919-139.315-51.58-1.28-45.659 116.597-50.554 165.104-54.17 9.536-0.768 27.358-4.64 41.277-2.592zM334.033 626.95c12.127 1.536-8.512 8.767-5.152 18.047 44.38 43.867 182.383 31.485 250.217 18.046 14.174-2.848 28.381-11.36 38.684-10.335 25.79 2.336 42.3 32.253 64.506 36.124-78.425 35.357-229.834 52.124-340.512 30.942-28.637-5.408-78.425-20.895-79.96-43.868-2.336-31.23 49.275-44.38 72.217-49.02z m33.533 105.782c7.999 2.592-2.848 6.976-2.592 10.335 23.486 40.765 139.57 26.302 198.637 12.895 11.871-2.848 23.742-11.103 33.533-10.335 29.917 2.048 41.276 33.277 67.066 38.684-82.297 50.3-281.702 70.682-363.742 7.744-3.872-45.916 33.02-51.067 67.066-59.323z m-74.81 77.401c-24.51 6.207-87.96-2.592-90.295 30.941-0.768 12.895 21.662 28.126 36.125 33.533 84.088 31.741 253.064 36.637 392.09 20.638 64.507-7.487 185.743-29.15 170.257-95.447 19.358 2.336 36.636 14.719 38.684 33.533 7.744 71.193-155.825 101.11-221.835 108.342-143.698 15.742-323.234 12.639-433.367-25.79-35.869-12.383-79.193-35.357-77.401-69.657 3.104-57.787 142.387-73.785 185.743-36.125z m219.276 213.836c-96.727-10.591-189.87-24.766-268.295-59.322 205.069 49.275 504.049 45.66 647.491-59.323 7.744-5.663 14.975-16.766 25.79-15.486-36.125 108.341-174.896 115.829-294.084 134.131H512zM579.098 0.096c18.046 17.022 30.94 48.763 30.94 82.552 0 99.83-105.75 157.617-157.36 224.427-11.36 14.975-26.046 37.917-25.79 61.914 0.512 54.427 56.763 115.318 77.4 159.953-36.124-23.741-79.96-55.45-110.933-92.855-30.941-37.148-61.914-97.495-33.533-149.618 42.556-78.425 169.232-125.108 214.124-208.94 10.847-20.382 19.358-51.58 5.152-77.401z m152.21 536.59c53.146-45.404 143.154-27.614 147.026 49.02 4.383 89.783-93.912 140.082-165.105 144.466 33.021-31.486 120.213-82.04 103.19-154.77-6.975-29.405-43.611-47.196-85.112-38.684z",
                data:[0.8, 0.6, 0.3],
                outline: {
                  show: false
                },
                label: {
                  normal: {
                    position: 'bottom',
                    // formatter: '应用总数:'+scope.data.length+"个",
                    formatter: "JAVA",
                    textStyle: {
                      color: '#178ad9',
                      fontSize: scope.panel.fontsize
                    }
                  }
                }
              },{
                name: '',
                type: 'pie',
                center: ['50%', '60%'],
                clockWise: true,
                hoverAnimation: false,
                radius: [60, 60],
                label: {
                  normal: {
                    position: 'center'
                  }
                },
                data: [{
                  value: 10,
                  label: {
                    normal: {
                      formatter: '',
                      textStyle: {
                        color: '#1a93f9',
                        fontSize: scope.panel.fontsize
                      }
                    }
                  },
                  itemStyle:{
                    normal:{
                      color:'#1a93f9',
                    }
                  }
                }, {
                  tooltip: {
                    show: false
                  },
                  label: {
                    normal: {
                      formatter: '应用服务器:'+chartData[0][0].appserver,

                      textStyle: {
                        color: '#1a93f9',
                        fontSize: scope.panel.fontsize,
                        fontWeight: 'bold'
                      }
                    }
                  }
                }
                ]
              },{
                name: '',
                type: 'pie',
                center: ['50%', '70%'],
                clockWise: true,
                hoverAnimation: false,
                radius: [60, 60],
                label: {
                  normal: {
                    position: 'center'
                  }
                },
                data: [{
                  value: 10,
                  label: {
                    normal: {
                      formatter: '',
                      textStyle: {
                        color: '#1a93f9',
                        fontSize: scope.panel.fontsize
                      }
                    }
                  },
                  itemStyle:{
                    normal:{
                      color:'#1a93f9',
                    }
                  }
                }, {
                  tooltip: {
                    show: false
                  },
                  label: {
                    normal: {
                      formatter: '操作系统:'+chartData[0][0].os,
                      textStyle: {
                        color: '#1a93f9',
                        fontSize: scope.panel.fontsize,
                        fontWeight: 'bold'
                      }
                    }
                  }
                }
                ]
              },{
                name: '',
                type: 'pie',
                center: ['50%', '80%'],
                clockWise: true,
                hoverAnimation: false,
                radius: [60, 60],
                label: {
                  normal: {
                    position: 'center'
                  }
                },
                data: [{
                  value: 10,
                  label: {
                    normal: {
                      formatter: '',
                      textStyle: {
                        color: '#1a93f9',
                        fontSize: scope.panel.fontsize
                      }
                    }
                  },
                  itemStyle:{
                    normal:{
                      color:'#1a93f9',
                    }
                  }
                }, {
                  tooltip: {
                    show: false
                  },
                  label: {
                    normal: {
                      formatter: '主机名:'+chartData[0][0].hostname,
                      textStyle: {
                        color: '#1a93f9',
                        fontSize: scope.panel.fontsize,
                        fontWeight: 'bold'
                      }
                    }
                  }
                }
                ]
              },{
                name: '',
                type: 'pie',
                center: ['50%', '90%'],
                clockWise: true,
                hoverAnimation: false,
                radius: [60, 60],
                label: {
                  normal: {
                    position: 'center'
                  }
                },
                data: [{
                  value: 10,
                  label: {
                    normal: {
                      formatter: '',
                      textStyle: {
                        color: '#1a93f9',
                        fontSize: scope.panel.fontsize
                      }
                    }
                  },
                  itemStyle:{
                    normal:{
                      color:'#1a93f9',
                    }
                  }
                }, {
                  tooltip: {
                    show: false
                  },
                  label: {
                    normal: {
                      formatter: 'JAVA版本:'+chartData[0][0].javaversion,
                      textStyle: {
                        color: '#1a93f9',
                        fontSize: scope.panel.fontsize,
                        fontWeight: 'bold'
                      }
                    }
                  }
                }
                ]
              }

              ],
              tooltip: {
                show: false
              }
            };
            // 使用刚指定的配置项和数据显示图表。
            myChart.setOption(option);
            // myChart.on('datazoom', function (params) {
            //           if (scope.panel.linkage) {
            //               filterSrv.set({
            //                   type: 'time',
            //                   // from  : moment.utc(ranges.xaxis.from),
            //                   // to    : moment.utc(ranges.xaxis.to),
            //                   from: moment.utc(selecttime[params.batch[0].startValue]).toDate(),
            //                   to: moment.utc(selecttime[params.batch[0].endValue]).toDate(),
            //                   field: filterSrv.getTimeField()
            //               });
            //               dashboard.current.linkage_id = scope.panel.linkage_id;
            //               dashboard.current.enable_linkage = false;
            //               dashboard.refresh();
            //           }
            //
            // });
          }

          });
          }


      }
    };
  });

});
