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
      console.log('adStacking DEBUG : ' + DEBUG);

      var module = angular.module('kibana.panels.adStacking', []);
      app.useModule(module);

      module.controller('adStacking', function($scope, $http,$sce,$timeout, $routeParams, $translate,timer, querySrv, dashboard, filterSrv) {
        $scope.panelMeta = {
          exportfile: true,
          editorTabs : [
            {title:$translate.instant('Queries'), src:'app/partials/querySelect.html'}
          ],
          status  : "Stable",
          description : ""
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
          sortBy  : 'count',
          order   : 'descending',
          fontsize   : 12,
          donut   : false,
          HbaseIP:'',
          isrefresh:true,
          tilt    : false,
          display:'block',
          edge:'',
          icon:"icon-caret-down",
          labels  : true,
          ylabels :true,
          logAxis : false,
          arrangement : 'vertical',
          RoseType	  : 'area',
          chart       : 'sub_graph',
          solrFq :filterSrv.getSolrFq(),
          exportSize : 10000,
          linkage_id:'a',
          value_sort:'rs_timestamp',
          defaulttimestamp:true,
          lastColor : '',
          spyable     : true,
          show_queries:true,
          error : '',
          chartColors : querySrv.colors,
          refresh: {
            enable: false,
            interval: 2
          },
          max_rows : 1000,
          top : 10
        };

        _.defaults($scope.panel,_d);

        $scope.init = function () {
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
          if($scope.panel.display === 'none'){
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
          var fq = '';
          if (filterSrv.getSolrFq()) {
            fq = '&' + filterSrv.getSolrFq();
          }
          if (_.isUndefined($routeParams.jm_name_s)) {
          } else {
            fq += '&fq=jm_name_s:' + $routeParams.jm_name_s;
          }
          if (_.isUndefined($routeParams.id)) {
          } else {
            fq += '&fq=id:' + $routeParams.id;
          }
          var wt_json = '&wt=' + filetype;
          var rows_limit = '&rows=' + $scope.panel.max_rows; // for terms, we do not need the actual response doc, so set rows=0
          var facet = '';
          var sort = '&sort=rs_timestamp%20asc'
          return querySrv.getORquery() + wt_json + rows_limit + fq + sort + facet + ($scope.panel.queries.custom !== null ? $scope.panel.queries.custom : '');
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
            kbn.download_response(response, filetype, "pies");
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
            $scope.data = [];
            $scope.panelMeta.loading = false;
            if (DEBUG) { console.log(results);}
            $scope.data = [];
            var cpu_durations = eval('('+results.response.docs[0].cpu_duration+')');
            if (DEBUG) {
              console.log(cpu_durations);
            }
            for (var index in cpu_durations) {
              var slice = {
                name: cpu_durations[index].name,
                duration: cpu_durations[index].duration,
                stack_trace: cpu_durations[index].stack_trace
              };
              $scope.data.push(slice);
            }
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

      module.directive('adstackingChart', function(querySrv,dashboard,filterSrv) {
        return {
          restrict: 'A',
          link: function(scope, elem) {
            // Receive render events
            var myChart = undefined;
            scope.$on('render',function(){
              render_panel();
            });

            // Re-render if the window is resized
            angular.element(window).bind('resize', function(){
              render_panel();
            });

            // Function for rendering panel
            function render_panel() {
              var colors = [];
              // IE doesn't work without this
              elem.css({height:scope.panel.height||scope.row.height});
              if (filterSrv.idsByTypeAndField('pies',scope.panel.field).length > 0) {
                colors.push(scope.panel.lastColor);
              } else {
                colors = scope.panel.chartColors;
              }
              if (DEBUG) {
                console.log(scope.data);
              }
              var durations = {};
              for (var index in scope.data) {
                if (durations[scope.data[index].name]) {
                  durations[scope.data[index].name] += scope.data[index].duration;
                } else {
                  durations[scope.data[index].name] = scope.data[index].duration;
                }
              }
              var sort_indexs=Object.keys(durations).sort(function(a,b){return durations[a]-durations[b]});
              var data = [];
              var dataCount = 10;
              var startTime = +new Date();
              var categories = [];
              categories.push("duration");
              var baseTime = startTime;
              if (DEBUG) {console.log(colors);}
              var series = [];
              var legends = [];
              var len = sort_indexs.length;
              var color_index = 0;
              for (var index=0; index<sort_indexs.length; index += 1) {
                if (index + scope.panel.top < len) continue;
                var name = sort_indexs[index];
                legends.push(name);
                var typeItem = {
                  name:name,
                  color:colors[color_index%colors.length]
                };
                color_index += 1;
                var duration = durations[name];
                series.push({
                  name: name,
                  type: 'bar',
                  stack: 'duration',
                  itemStyle: {
                    normal: {
                      color: typeItem.color,
                      barBorderRadius:5,
                      borderWidth:3
                    }
                  },
                  label: {
                    normal: {
                      show: true,
                      position: 'inside'
                    }
                  },
                  data: [duration]
                });
              }
              var id = scope.$id;
              require(['echarts'], function(ec){
                var echarts = ec;
                if(myChart){
                  myChart.dispose();
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
                      return params.seriesName + ': ' + params.data + ' ms';
                    }
                  },
                  grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    top: '40%'
                  },

                  legend: {
                    data: legends
                  },
                  xAxis:  {
                    type: 'value',
                    show: false
                  },
                  yAxis: {
                    type: 'category',
                    show: false,
                    data: categories
                  },
                  series: series
                };
                myChart = echarts.init(document.getElementById(id));
                myChart.setOption(option);
              });
            }
          }
        };
      });
});
