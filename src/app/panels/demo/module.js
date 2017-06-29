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
        'angular-smart-table',
    ],
    function (angular, app, _, $, kbn) {
        'use strict';

        var module = angular.module('kibana.panels.demo', []);
        app.useModule(module);

        module.controller('demo', function($scope, $timeout, $filter, timer, querySrv, dashboard, filterSrv) {
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
                path: "",
                refresh: {
                      enable: false,
                      interval: 2
                  },
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

            $scope.set_refresh = function (state) {
                $scope.refresh = state;
            };

            $scope.img_path = $scope.panel.path;
        });


    });
