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
        'kbn',
        'angular-smart-table'
    ],
    function (angular, app, _, $, kbn) {
        'use strict';

        var DEBUG = false;
        console.log('adCPUDuration DEBUG : ' + DEBUG);

        var module = angular.module('kibana.panels.adCPUDuration', ['smart-table']);
        app.useModule(module);

        module.controller('adCPUDuration', function($scope, $timeout, $filter, $routeParams, timer, querySrv, dashboard, filterSrv) {
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
                mode    : 'statistic', // mode to tell which number will be used to plot the chart.
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
                chartColors : querySrv.colors,
                refresh: {
                    enable: false,
                    interval: 2
                },
              itemsByPage: 10,
              displayPage: 10,
              max_rows : 1000,
              imgVar : true
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
            var wt_json = '&wt=' + filetype;
            var fl = '&fl=cpu_duration';
            var rows_limit = '&rows=' + $scope.panel.max_rows; // for terms, we do not need the actual response doc, so set rows=0
            return querySrv.getORquery() + wt_json + rows_limit + fq + fl +($scope.panel.queries.custom !== null ? $scope.panel.queries.custom : '');
          };

          $scope.exportfile = function(filetype) {

              var query = this.build_query(filetype, true);

              $scope.sjs.client.server(solr_url);

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
            $scope.sjs.client.server(dashboard.current.solr.server + dashboard.current.solr.core_name);

            var request, results;
            request = $scope.sjs.Request().indices(dashboard.indices);
            $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);

            // Populate the inspector panel
            $scope.inspector = angular.toJson(JSON.parse(request.toString()), true);

            var query = this.build_query('json');

            // Set the panel's query
            $scope.panel.queries.query = query;

            request.setQuery(query);
            results = request.doSearch();
            // Populate scope when we have results
            results.then(function successCallback(response) {
              if (DEBUG ) console.log(response);
              $scope.panelMeta.loading = false;
              $scope.hits = response.response.numFound;
              $scope.data = [];
              var cpu_durations = eval('('+response.response.docs[0].cpu_duration+')');
              if (DEBUG) {
                console.log(cpu_durations);
              }
              for (var index in cpu_durations) {
                var slice = {
                  name: cpu_durations[index].name,
                  duration: cpu_durations[index].duration,
                  stack_trace: cpu_durations[index].stack_trace
                };
                $scope.panel.imgVar = false;
                $scope.data.push(slice);
              }
              if (DEBUG) {console.log($scope.data);}
            }, function errorCallback() {
              // called asynchronously if an error occurs
              // or server returns response with an error status.
            });
              $scope.$emit('render');
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
    });
