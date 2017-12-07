/*

  ## Anomaly Detection Branch

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
    './timeSeries'
],
function (angular, app, $, _, kbn, moment, timeSeries) {
  'use strict';
  var module = angular.module('kibana.panels.adBranch', []);
  app.useModule(module);

  var DEBUG = false;
  console.log('adBranch DEBUG : ' + DEBUG);
  module.controller('adBranch', function($scope, $q, $http, $routeParams, $location, querySrv, dashboard, filterSrv) {
    $scope.panelMeta = {
      modals : [
        {
          description: "Inspect",
          icon: "icon-info-sign",
          partial: "app/partials/inspector.html",
          show: $scope.panel.spyable
        }
      ],
      editorTabs : [
        {
          title:'Queries',
          src:'app/partials/querySelect.html'
        }
      ],
      status  : "Stable",
      description : "A bucketed time series chart of the current query, including all applied time and non-time filters, when used in <i>count</i> mode. Uses Solr’s facet.range query parameters. In <i>values</i> mode, it plots the value of a specific field over time, and allows the user to group field values by a second field."
    };

    // Set and populate defaults
    var _d;
    _d = {
      panelExpand:true,
      fullHeight:'700%',
      useInitHeight:true,
      mode: 'value',
      queries: {
        mode: 'all',
        ids: [],
        query: '*:*',
        custom: ''
      },
      max_rows: 1000,  // maximum number of rows returned from Solr (also use this for group.limit to simplify UI setting)
      time_length: 60,
      anomaly_th: 0.70,
      reverse: 0,
      group_field: null,
      auto_int: true,
      total_first: '%',
      fontsize: 20,
      field_color: '#209bf8',
      resolution: 100,
      value_sort: 'rs_timestamp',
      interval: '5m',
      intervals: ['auto', '1s', '1m', '5m', '10m', '30m', '1h', '3h', '12h', '1d', '1w', '1M', '1y'],
      fill: 0,
      linewidth: 3,
      chart: 'stacking',
      chartColors: ['#209bf8', '#f4d352', '#ccf452', '#8cf452', '#3cee2b', '#f467d8', '#2fd7ee'],
      timezone: 'browser', // browser, utc or a standard timezone
      spyable: true,
      zoomlinks: true,
      bars: true,
      stack: true,
      label: true,
      points: false,
      lines: false,
      lines_smooth: false, // Enable 'smooth line' mode by removing zero values from the plot.
      legend: true,
      'x-axis': true,
      'y-axis': true,
      percentage: false,
      interactive: true,
      options: true,
      show_queries: true,
      tooltip: {
        value_type: 'cumulative',
        query_as_alias: false
      },
      jobid: '',
      job_status: 'Ready',
      metric_field: 'facet_name_s',
      ad_name: 'ad_name',
      fields:[]
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
      if (DEBUG) { console.log('init'); }
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

    $scope.interval_label = function(interval) {
      return $scope.panel.auto_int && interval === $scope.panel.interval ? interval+" (auto)" : interval;
    };

    $scope.set_refresh = function (state) {
        $scope.refresh = state;
        // if 'count' mode is selected, set decimal_points to zero automatically.
        if ($scope.panel.mode === 'count') {
            $scope.panel.decimal_points = 0;
        }
        $scope.get_data();
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

    $scope.goToUrl=function(path) {    //此方法可以改变location地址；
      if (DEBUG) {console.log(path);}
      location.href = path;
    }

    $scope.toggle_field = function(field) {
      if (_.indexOf($scope.panel.fields, field) > -1) {
        $scope.panel.fields = _.without($scope.panel.fields, field);
      } else {
        $scope.panel.fields.push(field);
      }
      $scope.$emit('render');
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
    $scope.get_data = function(segment) {
      if (DEBUG) { console.log('get data start.'); }
      if (_.isUndefined(segment)) {
        segment = 0;
      }
      delete $scope.panel.error;

      // Make sure we have everything for the request to complete
      if(dashboard.indices.length === 0) {
        return;
      }
      var _range = $scope.get_time_range();
      var _interval = $scope.get_interval(_range);

      if ($scope.panel.auto_int) {
        $scope.panel.interval = kbn.secondsToHms(
          kbn.calculate_interval(_range.from,_range.to,$scope.panel.resolution,0)/1000);
      }

      $scope.panelMeta.loading = true;

      // Solr
      $scope.sjs.client.server(dashboard.current.solr.server + dashboard.current.solr.core_name);

      var request = $scope.sjs.Request().indices(dashboard.indices[segment]);
      // $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);

      if(_.isNull($scope.panel.value_field)) {
        $scope.panel.error = "In " + $scope.panel.mode + " mode a field must be specified";
        return;
      }


      // Build Solr query
      var fq = '';
      if (filterSrv.getSolrFq()) {
        fq = '&' + filterSrv.getSolrFq();
      }


      var start_time = filterSrv.getStartTime();
      var end_time = filterSrv.getEndTime();

      $scope.panel.start_time = start_time;
      $scope.panel.end_time = end_time;

      // facet.range.end does NOT accept * as a value, need to convert it to NOW
      if (end_time === '*') {
          end_time = 'NOW';
      }


      var wt_json = '&wt=json';
      var anomaly_th = $scope.panel.anomaly_th;
      var sort_field = '&sort='+'start_timestamp_l'+'%20asc';
      var rows_limit = '&rows='+$scope.panel.max_rows;
      var facet = '';
      var fl = '';
      fq = fq + '&fq=anomaly_f:[' + anomaly_th + '%20TO%20*]'; 
      fq = fq + '&fq=result_s:ad';
      var mypromises = [];
      var arr_id = [];
      var index = 0;
      var temp_q = 'q=*:*' + wt_json + rows_limit + fq + facet + fl + sort_field;
      if (DEBUG) {console.log(fq); }
      $scope.panel.queries.query += temp_q + "\n";
      if ($scope.panel.queries.custom !== null) {
        request = request.setQuery(temp_q + $scope.panel.queries.custom);
      } else {
        request = request.setQuery(temp_q);
      }
      mypromises.push(request.doSearch());
      arr_id.push(0);

      $scope.data = [];
      if (dashboard.current.services.query.ids.length >= 1) {
        $q.all(mypromises).then(function(results) {
          $scope.panelMeta.loading = false;
          // Convert facet ids to numbers
          // var facetIds = _.map(_.keys(results.facets),function(k){return parseInt(k, 10);});
          //var facetIds = [0]; // Need to fix this

          // Make sure we're still on the same query/queries
          // TODO: We probably DON'T NEED THIS unless we have to support multiple queries in query module.
          // if ($scope.query_id === query_id && _.difference(facetIds, $scope.panel.queries.ids).length === 0) {
          var i = 0,
            time_series,
            hits;

          _.each(arr_id, function(id,index) {
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
              hits = 0;
              $scope.hits = 0;
            }
            $scope.data[i] = results[index].response.docs;
            i++;
          });

          // Tell the histogram directive to render.
          $scope.$emit('render');
        });
      }
    };
  });

  module.directive('branchChart', function(querySrv,dashboard,filterSrv) {
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
          var plot, chartData;
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

          var metrics_id = scope.$id;
          require(['echarts'], function(ec){
            var echarts = ec;
            if(myChart){
              myChart.dispose();
            }
            var labelcolor = false;
            if (dashboard.current.style === 'dark'||dashboard.current.style === 'black'){
                labelcolor = true;
            }
            var time_length = scope.panel.time_length + 1;
            myChart = echarts.init(document.getElementById(metrics_id));
            var start_time = Date.parse(new Date(scope.get_time_range()['from']));
            var end_time = Date.parse(new Date(scope.get_time_range()['to']));
            var step = time_length*1000*60;
            var ad_name = scope.panel.ad_name;
            var metric_field = scope.panel.metric_field;
            var fields = scope.panel.fields;
            var dates = [];
            var timestamps = [];
            if (DEBUG) {console.log(scope.get_time_range());}
            if (DEBUG) {console.log(start_time);}

            var data = []; var index = 0; var metric2index = {}; var index2metric = {}; var metric_names = [];
            for (var timestamp = start_time; timestamp <= end_time; timestamp += step) {
              timestamps.push(timestamp);
              dates.push(
                echarts.format.formatTime('yyyy/MM/dd hh:mm:ss', timestamp)
              );
              data.push({});
            }
            if (DEBUG) { console.log(ad_name); }
            if (DEBUG) {console.log(chartData); }
            if (DEBUG) {console.log(fields); }
            chartData.map(function (anomalys) {
              anomalys.map(function (anomaly) {
                var date_index = Math.floor((anomaly['start_timestamp_l'] - start_time) / step);
                if (date_index >= 0) {
                  if (date_index < dates.length) {
                    var metric_value = anomaly.value_f;
                    var anomaly_value = anomaly.anomaly_f;
                    var from_timestamp = timestamps[date_index];
                    var to_timestamp = timestamps[date_index] + step;
                    var solr_reader_url = anomaly.solr_reader_url_s;
                    var solr_writer_url = anomaly.solr_writer_url_s;
                    var metric = anomaly.show_name_s;
                    var ad_name = anomaly.ad_name_s;

                    if (fields.length > 0) {
                      var flag = -1;
                      for (var key in fields) {
                        var field = fields[key];
                        if (field === metric) { flag = 1; }
                      }
                      if (flag === -1) {return;}
                    }

                    if (data[date_index][ad_name] === undefined) {
                      data[date_index][ad_name] = [];
                    }
                    if (metric2index[ad_name] === undefined) {
                      metric2index[ad_name] = index;
                      index2metric[index] = ad_name;
                      metric_names.push(metric);
                      index += 1;
                    }
                    data[date_index][ad_name].push({
                      date_index: date_index,
                      anomaly_date: dates[date_index],
                      anomaly_value: anomaly_value,
                      metric_value: metric_value,
                      from_timestamp: from_timestamp,
                      to_timestamp: to_timestamp,
                      solr_reader_url: solr_reader_url,
                      solr_writer_url: solr_writer_url,
                      ad_name : ad_name
                    });
                  }
                }
              });
            });
            var show_data = [];
            var max_num = 0;
            for (var date_index = 0; date_index < dates.length; date_index++) {
              for (var metric in data[date_index]) {
                if (data[date_index][metric].length > 0) {
                  show_data.push([date_index, metric2index[metric], data[date_index][metric].length]);
                }
                if (data[date_index][metric].length > max_num) {
                  max_num = data[date_index][metric].length;
                }
              }
            }
            if (max_num < 10) {
              max_num = 10;
            }
            if (DEBUG) { console.log(data); }
            if (DEBUG) { console.log(max_num); }
            if (DEBUG) { console.log(metric2index); }
            var option = {
                tooltip: {
                  show: true,
                  formatter: function (a, b) {
                    return  metric_names[a.data[1]] + '<br/>' + dates[a.data[0]];
                  }
                },
                animation: false,
                grid: {
                  height: '90%',
                  y: '5%',
                  x: '10%'
                },
                xAxis: {
                    type: 'category',
                    data: dates,
                    splitArea: {
                        show: true
                    },
                    axisLine:{
                        lineStyle:{
                            color:'#aaaaaa',
                            width:1
                        }
                    }
                },
                yAxis: {
                    type: 'category',
                    data: metric_names,
                    splitArea: {
                        show: true
                    },
                    axisLine:{
                        lineStyle:{
                            color:'#aaaaaa',
                            width:1
                        }
                    }
                },
                visualMap: {
                    min: 0,
                    max: max_num,
                    show: false
                },
                series: [{
                    name: 'anomaly',
                    type: 'heatmap',
                    data: show_data,
                    label: {
                        normal: {
                            show: true
                        }
                    }
                }]
            };

            myChart.setOption(option);

            myChart.on('click', function (params) {
              //cuixilong
              var x = params.data[0];
              var y = index2metric[params.data[1]];
              if (data[x][y][0] === undefined){
                return ;
              }
              if (DEBUG) {console.log( data[x][y]);}
              if (DEBUG) {console.log(y);}
              var resourceId = data[x][y][0].ad_name;
              //var path = '/banana/src/index.html?_ijt=aup5t4uvr3lda733ku4so5viq2#!/dashboard?kbnType=file&kbnId=Resource_Analysis&res_id=' + resourceId;
              var path = 'index.html#!/dashboard?kbnType=file&kbnId=Resource_Analysis&res_id=' + resourceId;
              scope.goToUrl(path);
            });
        });
        }
      }
    };
  });


});
