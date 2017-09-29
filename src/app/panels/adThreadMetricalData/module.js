/*
 ## Terms

 ### Parameters
 * style :: A hash of css styles
 * size :: top N
 * arrangement :: How should I arrange the query results? 'horizontal' or 'vertical'
 * chart :: Show a chart? 'none', 'bar', 'pie'
 * donut :: Only applies to 'pie' charts. Punches a hole in the chart for some reason
 * tilt :: Only 'pie' charts. Janky 3D effect. Looks terrible 90% of the time.
 * lables :: Only 'pie' charts. Labels on the pie?
 */
define([
      'angular',
      'app',
      'underscore',
      'jquery',
      'kbn'
  ],
  function (angular, app, _, $, kbn) {
    'use strict';
    var DEBUG = false;
    console.log('adThreadMetricalData DEBUG : ' + DEBUG);

    var module = angular.module('kibana.panels.adThreadMetricalData', []);
    app.useModule(module);

    module.controller('adThreadMetricalData', function($scope, $timeout, $filter, $routeParams, timer, querySrv, dashboard, filterSrv) {
      $scope.panelMeta = {
          exportfile: true,
          editorTabs : [
              {title:'Queries', src:'app/partials/querySelect.html'}
          ],
          status  : "Stable",
          description : "Displays the results of a Solr facet as a pie chart, bar chart, or a table. Newly added functionality displays min/max/mean/sum of a stats field, faceted by the Solr facet field, again as a pie chart, bar chart or a table."
      };

      // Set and populate defaults
      var _d = {
          queries     : {
              mode        : 'all',
              ids         : [],
              query       : '*:*',
              custom      : ''
          },
          mode    : 'count', // mode to tell which number will be used to plot the chart.
          field   : '',
          stats_field : '',
          decimal_points : 0, // The number of digits after the decimal point
          exclude : [],
          missing : false,
          other   : false,
          size    : 10000,
          display:'block',
          icon:"icon-caret-down",
          sortBy  : 'count',
          threshold_first:3000,
          threshold_second:5000,
          order   : 'descending',
          style   : { "font-size": '10pt'},
          fontsize:20,
          linkage_id:'a',
          donut   : false,
          tilt    : false,
          labels  : true,
          logAxis : false,
          arrangement : 'horizontal',
          chart       : 'bar',
          counter_pos : 'above',
          exportSize : 10000,
          lastColor : '',
          spyable     : true,
          show_queries:true,
          error : '',
          max_rows : 1000,
          chartColors : querySrv.colors,
          anomaly_th:0.7,
          refresh: {
              enable: false,
              interval: 2
          }
      };
      _.defaults($scope.panel,_d);

      $scope.init = function () {
        $scope.hits = 0;
        //$scope.testMultivalued();
        if (_.isUndefined($routeParams.threadid)) {
        } else {
          $scope.threadid=$routeParams.threadid;
        }
        if (_.isUndefined($routeParams.memoryid)) {
        } else {
          $scope.memoryid=$routeParams.memoryid;
        }
        // Start refresh timer if enabled
        if ($scope.panel.refresh.enable) {
            $scope.set_timer($scope.panel.refresh.interval);
        }

        $scope.$on('refresh',function(){
            $scope.get_data();
        });

        $scope.get_data();
      };

      $scope.toUrl = function(path) {
        if (DEBUG) {console.log(path);}
        location.href = path;
      };

      $scope.get_time_range = function () {
          var range = filterSrv.timeRange('min');
          return range;
      };

      $scope.testMultivalued = function() {
          if($scope.panel.field && $scope.fields.typeList[$scope.panel.field] && $scope.fields.typeList[$scope.panel.field].schema.indexOf("M") > -1) {
              $scope.panel.error = "Can't proceed with Multivalued field";
              return;
          }

          if($scope.panel.stats_field && $scope.fields.typeList[$scope.panel.stats_field].schema.indexOf("M") > -1) {
              $scope.panel.error = "Can't proceed with Multivalued field";
              return;
          }
      };
      $scope.display=function() {
          if($scope.panel.display==='none'){
              $scope.panel.display='block';
              $scope.panel.icon="icon-caret-down";
          }else{
              $scope.panel.display='none';
              $scope.panel.icon="icon-caret-up";
          }
      };
      /**
       *
       *
       * @param {String} filetype -'json', 'xml', 'csv'
       */
      $scope.build_query = function(filetype) {
        // Build Solr query
        var fq = '&fq=result_s:jm_thread_ad';
        if (filterSrv.getSolrFq()) {
            fq += '&' + filterSrv.getSolrFq();
        }
        if (_.isUndefined($routeParams.jm_name_s)) {
        } else {
          fq += '&fq=jm_name_s:' + $routeParams.jm_name_s;
        }
        var fl = '&fl=timestamp_l%20rs_timestamp%20value_f%20type_s%20id%20jm_name_s';
        var wt_json = '&wt=' + filetype;
        var rows_limit = '&rows=' + $scope.panel.max_rows; // for terms, we do not need the actual response doc, so set rows=0
        var facet = '';
        var sort = '&sort=rs_timestamp%20asc'
        return querySrv.getORquery() + wt_json + rows_limit + fq + fl + sort + facet + ($scope.panel.queries.custom !== null ? $scope.panel.queries.custom : '');
      };

      $scope.exportfile = function(filetype) {
          var query = this.build_query(filetype, true);

          $scope.sjs.client.server(dashboard.current.solr.server + dashboard.current.solr.core_name);

          var request = $scope.sjs.Request().indices(dashboard.indices),
              response;

          request.setQuery(query);

          response = request.doSearch();

          // Populate scope when we have results
          response.then(function(response) {
              kbn.download_response(response, filetype, "terms");
          });
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

      $scope.get_data = function() {
        $scope.panel.mode = 'all';
        if(($scope.panel.linkage_id===dashboard.current.linkage_id)||dashboard.current.enable_linkage){
          // Make sure we have everything for the request to complete
          if (dashboard.indices.length === 0) {
              return;
          }
          delete $scope.panel.error;
          $scope.panelMeta.loading = true;
          var request, results;
          $scope.sjs.client.server(dashboard.current.solr.server + dashboard.current.solr.core_name);

          request = $scope.sjs.Request().indices(dashboard.indices);
          $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);

          // Populate the inspector panel
          $scope.inspector = angular.toJson(JSON.parse(request.toString()), true);

          if (dashboard.current.line_chart_anomaly_fq === undefined) {return ;}
          var query = this.build_query('json');

          if (DEBUG) {console.log(query);}
          // Set the panel's query
          $scope.panel.queries.query = query;

          request.setQuery(query);
          results = request.doSearch();
          // Populate scope when we have results

          results.then(function (results) {
            // Check for error and abort if found
            if (!(_.isUndefined(results.error))) {
                $scope.panel.error = $scope.parse_error(results.error.msg);
                $scope.data = [];
                $scope.panelMeta.loading = false;
                $scope.$emit('render');
                return;
            }
            $scope.data = [];
            var anomaly = [];
            $scope.panelMeta.loading = false;
            {
              // In stats mode, set y-axis min to null so jquery.flot will set the scale automatically.
              $scope.yaxis_min = null;
              if (DEBUG) { console.log(results);}
              var total = [];
              for (var index in results.response.docs) {
                var doc = results.response.docs[index];
                var slice = {value: doc.value_f, timestamp: doc.timestamp_l, l: doc.value_f, u:doc.value_f};
                if (doc.type_s === 'anomaly') {
                  anomaly.push({origin:doc.value_f, value:doc.value_f ,yAxis: doc.value_f, xAxis: doc.timestamp_l, id:doc.id, jm_name_s:doc.jm_name_s});
                }
                //var slice = {label: facet_field, data: [[k, stats_obj['mean'], stats_obj['count'], stats_obj['max'], stats_obj['min'], stats_obj['stddev'], facet_field]], actions: true};
                total.push(slice);
              }
              $scope.data.push(total);
              $scope.data.push(anomaly);
            }
            if (DEBUG) console.log($scope.data);
            $scope.$emit('render');
          });
        }
      };

      $scope.set_refresh = function (state) {
          $scope.refresh = state;
          // if 'count' mode is selected, set decimal_points to zero automatically.
          if ($scope.panel.mode === 'count') {
              $scope.panel.decimal_points = 0;
          }
      };

      $scope.close_edit = function() {
          // Start refresh timer if enabled
          if ($scope.panel.refresh.enable) {
              $scope.set_timer($scope.panel.refresh.interval);
          }

          if ($scope.refresh) {
              // $scope.testMultivalued();
              $scope.get_data();
          }
          $scope.refresh =  false;
          $scope.$emit('render');
      };

      $scope.showMeta = function(term) {
          if(_.isUndefined(term.meta)) {
              return true;
          }
          if(term.meta === 'other' && !$scope.panel.other) {
              return false;
          }
          if(term.meta === 'missing' && !$scope.panel.missing) {
              return false;
          }
          return true;
      };
    });

    module.directive('threadMetricalData', function(querySrv,dashboard,filterSrv) {
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
            elem.css({height: scope.panel.height || scope.row.height});

            // Make a clone we can operate on.

            chartData = _.clone(scope.data);
            chartData = scope.panel.missing ? chartData :
              _.without(chartData, _.findWhere(chartData, {meta: 'missing'}));
            chartData = scope.panel.other ? chartData :
              _.without(chartData, _.findWhere(chartData, {meta: 'other'}));
            var line_id = scope.$id;
            require(['echarts'], function (ec) {
              var echarts = ec;
              if(myChart){
                myChart.dispose();
              }
              myChart = echarts.init(document.getElementById(line_id));
              if (chartData === []) return ;
              var totalData = chartData[0];
              var anomalyData = chartData[1];
              if (totalData === []) return ;
              if(DEBUG) { console.log(anomalyData); }
              var option = {
                tooltip: {
                  trigger: 'axis'
                },
                grid: {
                  left: '3%',
                  right: '4%',
                  bottom: '20%',
                  containLabel: false
                },
                xAxis: {
                  type: 'category',
                  data: totalData.map(function (item) {
                    var date = echarts.format.formatTime('yyyy/MM/dd hh:mm:ss', item.timestamp);
                    return date;
                  }),
                  splitLine: {
                    show: false
                  },
                  boundaryGap: false
                },
                yAxis: {
                  splitLine: {
                    show: false
                  }
                },
                toolbox: {
                  left: 'center',
                  feature: {
                    dataZoom: {
                      yAxisIndex: 'none'
                    },
                    restore: {},
                    saveAsImage: {}
                  }
                },
                dataZoom: [{
                  startValue: echarts.format.formatTime('yyyy/MM/dd hh:mm:ss', totalData[0].timestamp)
                }, {
                  type: 'inside'
                }],
                visualMap: {
                  show:false,
                  top: 10,
                  right: 10,
                  pieces: [{
                    gt: 0,
                    lte: 0.50,
                    color: '#096'
                  }, {
                    gt: 0.50,
                    lte: 0.90,
                    color: '#ffde33'
                  }, {
                    gt: 0.90,
                    lte: 1.50,
                    color: '#ff9933'
                  }, {
                    gt: 1.50,
                    lte: 2.50,
                    color: '#cc0033'
                  }, {
                    gt: 2.50,
                    lte: 3.50,
                    color: '#660099'
                  }, {
                    gt: 3.50,
                    color: '#7e0023'
                  }],
                  outOfRange: {
                    color: '#999'
                  }
                },
                series: {
                  type: 'bar',
                  data: totalData.map(function (item) {
                    return item.value;
                  }),
                  markLine: {
                    silent: true,
                    data: [{
                      yAxis: 0.5
                    }, {
                      yAxis: 0.9
                    }, {
                      yAxis: 1.5
                    }, {
                      yAxis: 2.5
                    }, {
                      yAxis: 3.5
                    }]
                  },
                  hoverAnimation: false,
                  symbolSize: 6,
                  itemStyle: {
                    normal: {
                      color: '#1ab0f9'
                    }
                  },
                  showSymbol: false,
                  markPoint: {
                    itemStyle:{
                      normal:{
                        color: '#ea4653',
                        label:{
                          show: true,
                          formatter: function (param) {
                            return param.origin;
                          }
                        }
                      }
                    },
                    data: anomalyData.map(function (item) {
                      item.xAxis = echarts.format.formatTime('yyyy/MM/dd hh:mm:ss', item.xAxis);

                      return item;
                    })
                  }
                }
              };
              myChart.setOption(option);
              myChart.on('click', function (params){
                if (params.componentType === 'markPoint') {
                  if (DEBUG) console.log(params.data);
                  //index.html?_ijt=vu6l9m5qhmp4rr2dbrhrt0nnpb#!/dashboard?jm_name_s=test&id=00abf40c-7027-406e-8fbc-298594fc4ada
                  var path = 'index.html?_ijt=vu6l9m5qhmp4rr2dbrhrt0nnpb#!/dashboard?';
                  path += 'jm_name_s=' + params.data.jm_name_s;
                  path += '&threadid=' + params.data.id;
                  path += '&memoryid=' + scope.memoryid;
                  if (DEBUG) console.log(path);
                  if (DEBUG) console.log(scope.memoryid);
                  scope.toUrl(path);
                }
              });
            });
          }
        }
      };
    });
});
