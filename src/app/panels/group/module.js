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

    'jquery.flot',
    'jquery.flot.pie',
    'jquery.flot.selection',
    'jquery.flot.time',
    'jquery.flot.stack',
    'jquery.flot.stackpercent',
    'jquery.flot.axislabels'
  ],
  function (angular, app, $, _, kbn, moment, timeSeries) {
    'use strict';

    var module = angular.module('kibana.panels.histogram', []);
    app.useModule(module);

    module.controller('group', function($scope,$translate, $q, $timeout, timer, querySrv, dashboard, filterSrv) {
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
        display:'block',
        mode        : 'values',
        queries     : {
          mode        : 'all',
          ids         : [],
          query       : '*:*',
          custom      : ''
        },
        max_rows    : 100000,  // maximum number of rows returned from Solr (also use this for group.limit to simplify UI setting)
        value_field : null,
        group_field : null,
        sum_value   : false,
        auto_int    : true,
        linkage_id:'a',
        yname:'时间（ms）',
        resolution  : 100,
        interval    : '5m',
        intervals   : ['auto','1s','1m','5m','10m','30m','1h','3h','12h','1d','1w','1M','1y'],
        fill        : 0,
        chartColors :['#0d6ece','#b8f53d','#3db3f5','#3df563','#3dedf5','#f5a93d','#f56a3d','#713df5','#dbe7c5','#c5d4e7','#6aecd3','#ec6aa0','#c8f519','#5ff519','#8b5fd8','#b493d2','#53eea5','#5393ee','#53ee97','#300abd','#0fbd0a','#0abd77','#0a65bd','#a2bd0a'],
        linewidth   : 3,
        timezone    : 'browser', // browser, utc or a standard timezone
        spyable     : true,
        zoomlinks   : true,
        bars        : true,
        stack       : true,
        points      : false,
        lines       : false,
        lines_smooth: false, // Enable 'smooth line' mode by removing zero values from the plot.
        legend      : true,
        'x-axis'    : true,
        'y-axis'    : true,
        percentage  : false,
        interactive : true,
        options     : true,
        show_queries: true,
        tooltip     : {
          value_type: 'cumulative',
          query_as_alias: false
        },
        refresh: {
          enable: false,
          interval: 2
        }
      };

      _.defaults($scope.panel,_d);

      $scope.init = function() {
        // Hide view options by default
        $scope.options = false;

        // Start refresh timer if enabled
        if ($scope.panel.refresh.enable) {
          $scope.set_timer($scope.panel.refresh.interval);
        }

        $scope.$on('refresh',function(){
          $scope.get_data();
        });

        $scope.get_data();
      };

      $scope.set_timer = function(refresh_interval) {
        $scope.panel.refresh.interval = refresh_interval;
        if (_.isNumber($scope.panel.refresh.interval)) {
          timer.cancel($scope.refresh_timer);
          $scope.realtime();
        } else {
          timer.cancel($scope.refresh_timer);
        }
      };

      //展现
      $scope.display=function() {
        if($scope.panel.display === 'none'){
          $scope.panel.display='block';
          $scope.panel.icon="icon-caret-down";


        }else{
          $scope.panel.display='none';
          $scope.panel.icon="icon-caret-up";
        }
      };

      $scope.realtime = function() {
        if ($scope.panel.refresh.enable) {
          timer.cancel($scope.refresh_timer);

          $scope.refresh_timer = timer.register($timeout(function() {
            $scope.realtime();
            $scope.get_data();
          }, $scope.panel.refresh.interval*1000));
        } else {
          timer.cancel($scope.refresh_timer);
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

            if ($scope.panel.mode === 'count') {
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
          $scope.time_field = time_field;
          var start_time = filterSrv.getStartTime();
          var end_time = filterSrv.getEndTime();

          // facet.range.end does NOT accept * as a value, need to convert it to NOW
          if (end_time === '*') {
            end_time = 'NOW';
          }

          var wt_json = '&wt=json';
          var rows_limit = '&rows=0'; // for histogram, we do not need the actual response doc, so set rows=0
          var facet_gap = $scope.sjs.convertFacetGap($scope.panel.interval);
          var facet = '&facet=true' +
            '&facet.range=' + time_field +
            '&facet.range.start=' + start_time +
            '&facet.range.end=' + end_time +
            '&facet.range.gap=' + facet_gap;
          var values_mode_query = '';

          // For mode = value
          if ($scope.panel.mode === 'values') {
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
          _.each($scope.panel.queries.ids, function (id) {
            var temp_q = querySrv.getQuery(id) + wt_json + rows_limit + fq + facet + values_mode_query;
            $scope.panel.queries.query += temp_q + "\n";
            if ($scope.panel.queries.custom !== null) {
              request = request.setQuery(temp_q + $scope.panel.queries.custom);
            } else {
              request = request.setQuery(temp_q);
            }
            mypromises.push(request.doSearch());
          });

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
              // TODO: change this, Solr do faceting differently
              // var facetIds = [0]; // Need to fix this

              // Make sure we're still on the same query/queries
              // TODO: We probably DON'T NEED THIS unless we have to support multiple queries in query module.
              // if ($scope.query_id === query_id && _.difference(facetIds, $scope.panel.queries.ids).length === 0) {
              var i = 0,
                time_series,
                hits;

              _.each($scope.panel.queries.ids, function (id, index) {
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

                // Solr facet counts response is in one big array.
                // So no need to get each segment like Elasticsearch does.
                var entry_time, entries, entry_value;

                if ($scope.panel.group_field) {
                  // Group By Field is specified
                  var groups = results[index].grouped[$scope.panel.group_field].groups;
                  $scope.group_data = groups;


                }




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

      $scope.zoomOut=function() {
        if(window.event.keyCode===107){
          $scope.reSize();
        }
      };
      // I really don't like this function, too much dom manip. Break out into directive?
      $scope.populate_modal = function(request) {
        $scope.inspector = angular.toJson(JSON.parse(request.toString()),true);
      };

      $scope.set_refresh = function (state) {
        $scope.refresh = state;
      };

      $scope.close_edit = function() {
        // Start refresh timer if enabled
        if ($scope.panel.refresh.enable) {
          $scope.set_timer($scope.panel.refresh.interval);
        }
        if ($scope.refresh) {
          $scope.get_data();
        }
        $scope.refresh = false;
        $scope.$emit('render');
      };

      $scope.render = function() {
        $scope.$emit('render');
      };
    });

    module.directive('groupChart', function(dashboard, filterSrv) {
      return {
        restrict: 'A',
        template: '<div></div>',
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
            // IE doesn't work without this
            var divHeight=scope.panel.height||scope.row.height;
            if(!scope.panel.useInitHeight){
              divHeight = scope.panel.fullHeight;
            }
            elem.css({height:divHeight});
            function unique(arr){
              // 遍历arr，把元素分别放入tmp数组(不存在才放)
              var tmp = new Array();
              for(var i in arr){
                //该元素在tmp内部不存在才允许追加
                if(tmp.indexOf(arr[i])==-1){
                  tmp.push(arr[i]);
                }
              }
              return tmp;
            }
            Date.prototype.pattern = function (fmt) {
              var o = {
                "M+" : this.getMonth() + 1, //月份
                "d+" : this.getDate(), //日
                "h+" : this.getHours() % 12 === 0 ? 12 : this.getHours() % 12, //小时
                "H+" : this.getHours(), //小时
                "m+" : this.getMinutes(), //分
                "s+" : this.getSeconds(), //秒
                "q+" : Math.floor((this.getMonth() + 3) / 3), //季度
                "S" : this.getMilliseconds() //毫秒
              };
              var week = {
                "0" : "/u65e5",
                "1" : "/u4e00",
                "2" : "/u4e8c",
                "3" : "/u4e09",
                "4" : "/u56db",
                "5" : "/u4e94",
                "6" : "/u516d"
              };
              if (/(y+)/.test(fmt)) {
                fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
              }
              if (/(E+)/.test(fmt)) {
                fmt = fmt.replace(RegExp.$1, ((RegExp.$1.length > 1) ? (RegExp.$1.length > 2 ? "/u661f/u671f" : "/u5468") : "") + week[this.getDay() + ""]);
              }
              for (var k in o) {
                if (new RegExp("(" + k + ")").test(fmt)) {
                  fmt = fmt.replace(RegExp.$1, (RegExp.$1.length === 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
                }
              }
              return fmt;
            };
            var aaa= scope.group_data;
            var label=[];
            var timedata=[];
            var y2=0;
            var y3=0;
            var dataAll=[];
            var data = [];
            var legend_name =scope.panel.value_field.split(" ");
            for(var i1=0;i1<aaa.length;i1++){
              label[i1] = aaa[i1].doclist.docs[ aaa[i1].doclist.numFound-1][legend_name[1]];
              for(var k=0; k<aaa[i1].doclist.numFound;k++ ){
                //var ccc = Date.parse(aaa[i1].doclist.docs[k][scope.time_field]);
                timedata[y2]=new Date(Date.parse(aaa[i1].doclist.docs[k][scope.time_field])).pattern("yyyy-MM-dd HH:mm:ss");
                //演示demo
                dataAll[y3]=[timedata[y2],aaa[i1].doclist.docs[k][legend_name[0]]*100];
                //dataAll[y3]=[timedata[y2],aaa[i1].doclist.docs[k][legend_name[0]]];
                y2++;
                y3++;

              }
              data[i1]=dataAll.sort();
              dataAll = [];
              y3=0;
            }
            timedata.sort();
            unique(timedata);
            var series = [];
            for(var i = 0;i<label.length;i++){
              // series[i]={name:label[i],stack: '总量',type:'line',data:data[i]};

              series[i]={name:label[i],type:'line',data:data[i]};
              //series[i]={name:label[i],type:'line',data:data[i]};
            }

            // Populate from the query service
            var idd = scope.$id;
            require(['echarts'], function(ec){
              var echarts = ec;

              var labelcolor = false;
              if (dashboard.current.style === 'dark'){
                labelcolor = true;
              }
              // Add plot to scope so we can build out own legend
              if(myChart) {
                myChart.dispose();
              }
              myChart = echarts.init(document.getElementById(idd));
              var option = {

                tooltip: {
                  trigger: 'axis',
                  confine:true,
                  axisPointer: {
                    animation: false
                  }
                },
                color:scope.panel.chartColors,
                legend: {
                  textStyle:{
                    color:labelcolor?'#DCDCDC':'#696969'
                  },
                  data:label
                },
                toolbox: {
                  feature: {
                    dataZoom: {
                      yAxisIndex: 'none'
                    },
                    dataView: {readOnly: false},
                    restore: {}
                  }
                },

                grid: {
                  left: '3%',
                  right: '4%',
                  bottom: '3%',
                  containLabel: true
                },
                xAxis : [
                  {
                    type : 'category',
                    boundaryGap : false,
                    axisLine: {onZero: true},
                    axisLabel:{
                      textStyle:{
                        color:labelcolor?'#DCDCDC':'#696969'
                      }
                    },
                    data :timedata
                  }
                ],
                yAxis : [
                  {
                    type : 'value',
                    name : scope.panel.yname,
                    min :0,
                    nameTextStyle:{
                      color:labelcolor?'#DCDCDC':'#696969'
                    },
                    axisLine:{
                      lineStyle:{
                        color:'#46474C'
                      }
                    },
                    splitLine:{
                      lineStyle:{
                        color:['#46474C']
                      }
                    },
                    axisLabel:{
                      textStyle:{
                        color:labelcolor?'#DCDCDC':'#696969'
                      }
                    }
                  }
                ],
                series : series
              };
              // 使用刚指定的配置项和数据显示图表。
              myChart.setOption(option);
              myChart.on('datazoom', function (params) {
                if (scope.panel.linkage) {
                  filterSrv.set({
                    type: 'time',
                    // from  : moment.utc(ranges.xaxis.from),
                    // to    : moment.utc(ranges.xaxis.to),
                    from: moment.utc(timedata[params.batch[0].startValue]).toDate(),
                    to: moment.utc(timedata[params.batch[0].endValue]).toDate(),
                    field: filterSrv.getTimeField()
                  });
                  dashboard.current.linkage_id = scope.panel.linkage_id;
                  dashboard.current.enable_linkage = false;
                  dashboard.refresh();
                }

              });

            });

          }

        }
      };
    });

  });
