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
        console.log('adThreadStates DEBUG : ' + DEBUG);

        var module = angular.module('kibana.panels.adThreadStates', []);
        app.useModule(module);

        module.controller('adThreadStates', function($scope, $timeout, $filter, $routeParams, timer, querySrv, dashboard, filterSrv) {
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
              anomaly_th:0.8,
              refresh: {
                  enable: false,
                  interval: 2
              },
              imgVar : true,
              echartVar: false
            };
            _.defaults($scope.panel,_d);

            $scope.init = function () {
              $scope.panel.imgVar = true;
              $scope.panel.echartVar = false;
              $scope.hits = 0;
              //$scope.testMultivalued();

              // Start refresh timer if enabled
              if ($scope.panel.refresh.enable) {
                  $scope.set_timer($scope.panel.refresh.interval);
              }

              $scope.$on('refresh',function(){
                  $scope.get_data();
              });

              $scope.get_data();
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
              if (_.isUndefined($routeParams.threadid)) {
              } else {
                fq += '&fq=id:' + $routeParams.threadid;
              }
              var fl = '&fl=states_list';
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
                $scope.panelMeta.loading = false;
                if (DEBUG) { console.log(results);}
                var total = [];
                for (var index in results.response.docs) {
                  var doc = results.response.docs[index];
                  //var slice = {label: facet_field, data: [[k, stats_obj['mean'], stats_obj['count'], stats_obj['max'], stats_obj['min'], stats_obj['stddev'], facet_field]], actions: true};
                  total.push(doc);
                }
                if (total[0].states_list) {
                  $scope.panel.imgVar = false;
                  $scope.panel.echartVar = true;
                }
                $scope.data = eval('('+total[0].states_list+')');
                if (DEBUG) console.log($scope.data);
                $scope.$emit('render');
              });
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

      module.directive('threadStates', function(querySrv,dashboard,filterSrv) {
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

              // IE doesn't work without this
              elem.css({height: scope.panel.height || scope.row.height});

              // Make a clone we can operate on.

              var chartData = _.clone();
              if (DEBUG) console.log(scope.data);
              var id = scope.$id;
              require(['echarts'], function (ec) {
                var echarts = ec;
                if(myChart){
                  myChart.dispose();
                }

                var data = [];
                var dataCount = 10;
                var startTime = +new Date();
                var categories = [];
                var types = [
                  {name: 'ABSENCE', color: '#7b9ce1'},
                  {name: 'TIMED_WAITING', color: '#bd6c6c'},
                  {name: 'RUNNABLE', color: '#75d874'},
                  {name: 'WAITING', color: '#efbc78'},
                  {name: 'BLOCKED', color: '#dc77dc'}
                ];
                var legends = ['ABSENCE', 'TIMED_WAITING', 'RUNNABLE', 'WAITING', 'BLOCKED'];
                var category_index = 0;
                for (var category in scope.data) {
                  categories.push(category);
                  var baseTime = startTime;
                  for (var index in scope.data[category]) {
                    var typeItem = types[0];
                    for (var i in types) {
                      if (types[i].name === scope.data[category][index]){
                        typeItem = types[i];
                      }
                    }
                    var duration = 1000;

                    data.push({
                      name: typeItem.name,
                      value: [
                        category_index,
                        baseTime,
                        baseTime += duration,
                        duration
                      ],
                      itemStyle: {
                        normal: {
                          color: typeItem.color
                        }
                      }
                    });
                  }
                  category_index += 1;
                }
                if (DEBUG) console.log(data);
                function renderItem(params, api) {
                  var categoryIndex = api.value(0);
                  var start = api.coord([api.value(1), categoryIndex]);
                  var end = api.coord([api.value(2), categoryIndex]);
                  var height = api.size([0, 1])[1] * 0.6;
                  return {
                    type: 'rect',
                    shape: echarts.graphic.clipRectByRect({
                      x: start[0],
                      y: start[1] - height / 2,
                      width: end[0] - start[0],
                      height: height
                    }, {
                      x: params.coordSys.x,
                      y: params.coordSys.y,
                      width: params.coordSys.width,
                      height: params.coordSys.height
                    }),
                    style: api.style()
                  };
                }

                var option = {
                  tooltip: {
                    formatter: function (params) {
                      return params.marker + params.name;
                    }
                  },
                  legend: {
                    data: legends
                  },
                  grid: {
                    left: '40%',
                    right: '4%',
                    bottom: '3%',
                    top:"4%"
                  },
                  xAxis: {
                    min: startTime,
                    scale: true,
                    axisLabel: {
                      formatter: function (val) {
                        return Math.max(0, val - startTime) + ' ms';
                      }
                    },
                    axisLine:{
                      lineStyle:{
                        width:2
                      }
                    },
                    show:false
                  },
                  yAxis: {
                    data: categories,
                    axisLine:{
                      lineStyle:{
                        width:2
                      }
                    }
                  },
                  series: [{
                    type: 'custom',
                    renderItem: renderItem,
                    itemStyle: {
                      normal: {
                        opacity: 1.0
                      }
                    },
                    encode: {
                      x: [1, 2],
                      y: 0
                    },
                    data: data
                  }]
                };
                myChart = echarts.init(document.getElementById(id));
                myChart.setOption(option);
              });
            }
          }
        };
      });
});
