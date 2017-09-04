/*
  ## D3 Bar Chart with Tooltip Integrated with Banana.
  ## Demo URL: bl.ocks.org/Caged/6476579

  ### Parameters
  * field :: Field for Facet Query for Bar Chart Data.
  * size :: Maximum Number of Bars.
*/
define([
    'angular',
    'app',
    'underscore',
    'jquery',
    'kbn',
    'd3',
    './d3.tip'
  ],
  function(angular, app, _, $, kbn, d3, d3tip) {
    'use strict';

    var module = angular.module('kibana.panels.bar', []);
    app.useModule(module);

    module.controller('bar', function($scope,$translate, querySrv, dashboard, filterSrv) {
      $scope.panelMeta = {

        editorTabs: [{
          title: $translate.instant('Queries'),
          src: 'app/partials/querySelect.html'
        }],
        status: "Experimental",
        description : ""
      };

      // Set and populate defaults
      var _d = {
        panelExpand:true,
        fullHeight:'700%',
        useInitHeight:true,
        queries: {
          mode: 'all',
          query: '*:*',
          custom: ''
        },
        field: '',
          display:'block',
          icon:"icon-caret-down",
        size: 10,
        spyable: true,
          linkage_id:'a',
          show_queries: true,
        error: '',
      };
      _.defaults($scope.panel, _d);

      $scope.init = function() {
        $scope.hits = 0;
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

        $scope.$on('refresh', function() {
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
        $scope.display=function() {
            if($scope.panel.display === 'none'){
                $scope.panel.display='block';
                $scope.panel.icon="icon-caret-down";


            }else{
                $scope.panel.display='none';
                $scope.panel.icon="icon-caret-up";
            }
        };

      $scope.get_data = function() {
          // Make sure we have everything for the request to complete
          if(($scope.panel.linkage_id === dashboard.current.linkage_id)||dashboard.current.enable_linkage){
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

          // Build Solr query
          var fq = '';
          if (filterSrv.getSolrFq() && filterSrv.getSolrFq() !== '') {
              fq = '&' + filterSrv.getSolrFq();
          }
          var wt_json = '&wt=json';
          var rows_limit = '&rows=0'; // for terms, we do not need the actual response doc, so set rows=0
          var facet = '&facet=true&facet.field=' + $scope.panel.field + '&facet.limit=' + $scope.panel.size;

          // Set the panel's query
          $scope.panel.queries.query = querySrv.getORquery() + wt_json + rows_limit + fq + facet;

          // Set the additional custom query
          if ($scope.panel.queries.custom != null) {
              request = request.setQuery($scope.panel.queries.query + $scope.panel.queries.custom);
          } else {
              request = request.setQuery($scope.panel.queries.query);
          }

          results = request.doSearch();

          // Populate scope when we have results
          results.then(function (results) {
              // Check for error and abort if found
              if (!(_.isUndefined(results.error))) {
                  $scope.panel.error = $scope.parse_error(results.error.msg);
                  return;
              }

              var sum = 0;

              var missing = 0;
              $scope.panelMeta.loading = false;
              $scope.hits = results.response.numFound;
              $scope.data = [];
              $scope.maxRatio = 0;

              $scope.yaxis_min = 0;
              _.each(results.facet_counts.facet_fields, function (v) {
                  for (var i = 0; i < v.length; i++) {
                      var term = v[i];
                      i++;
                      var count = v[i];
                      sum += count;
                      if (term === null) {
                          missing = count;
                      } else {
                          // if count = 0, do not add it to the chart, just skip it
                          if (count === 0) {
                              continue;
                          }
                          var slice = {
                              letter: term,
                              frequency: count
                          };
                          if (count / $scope.hits > $scope.maxRatio){
                              $scope.maxRatio = count / $scope.hits;
                          }
                          $scope.data.push(slice);
                      }
                  }
              });
              $scope.$emit('render');
          });
      }
      };

      $scope.build_search = function(word) {
        //增加联动控制

          if (word) {
              filterSrv.set({type: 'terms', field: $scope.panel.field, value: word, mandate: 'must'});
          } else {
              return;
          }
          dashboard.current.linkage_id = $scope.panel.linkage_id;
          dashboard.current.enable_linkage = false;
          dashboard.refresh();

      };

      $scope.set_refresh = function(state) {
        $scope.refresh = state;
        // if 'count' mode is selected, set decimal_points to zero automatically.
        if ($scope.panel.mode === 'count') {
          $scope.panel.decimal_points = 0;
        }
      };

      $scope.close_edit = function() {
        if ($scope.refresh) {
          $scope.get_data();
        }
        $scope.refresh = false;
        $scope.$emit('render');
      };
    });

    module.directive('barChart', function() {
      return {
        restrict: 'A',
        link: function(scope, element) {
          // Receive render events
          scope.$on('render', function() {
            render_panel();
          });

          // Re-render if the window is resized
          angular.element(window).bind('resize', function() {
            render_panel();
          });
          // Function for rendering panel
          function render_panel() {
            element.html("");
            var divHeight=scope.panel.height||scope.row.height;
            if(!scope.panel.useInitHeight){
              divHeight = scope.panel.fullHeight;
            }
            var width = element.parent().width();
            var height = parseInt(divHeight);

             var margin = {top: 40, right: 20, bottom: 60, left: 40};
              width = width - margin.left - margin.right;
              height = height - margin.top - margin.bottom;

              var formatPercent = d3.format(".0");

              var x = d3.scale.ordinal()
                  .rangeRoundBands([15, width], 0.1);

              var y = d3.scale.linear()
                  .range([height, 0]);

              var xAxis = d3.svg.axis()
                  .scale(x)
                  .orient("bottom");

              var yAxis = d3.svg.axis()
                  .scale(y)
                  .orient("left")
                  .tickFormat(formatPercent);

              var svg = d3.select(element[0]).append("svg")
                  .attr("width", width + margin.left + margin.right)
                  .attr("height", height + margin.top + margin.bottom)
                .append("g")
                  .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

              var tip = d3tip()
                  .attr('class', 'd3-tip')
                  .offset([-10, 0])
                  .html(function(d) {
                      return "<strong>Frequency:</strong> <span style='color:red'>" + d.frequency + "</span>";
                  });

              svg.call(tip);

              x.domain(scope.data.map(function(d) { return d.letter; }));
              y.domain([0, d3.max(scope.data, function(d) { return d.frequency; })]);

              svg.append("g")
                  .attr("class", "x axis")
                  .attr("transform", "translate(0," + height + ")")
                  .call(xAxis)
                .selectAll("text")
                  .style("text-anchor", "end")
                  .attr("dx", "-.8em")
                  .attr("dy", "-.55em")
                  .attr("transform", "rotate(-60)" );

              svg.append("g")
                  .attr("class", "y axis")
                  .call(yAxis)
                .append("text")
                  .attr("transform", "rotate(-90)")
                  .attr("y", 6)
                  .attr("dy", ".71em")
                  .style("text-anchor", "end")
                  .text("Frequency");

              svg.selectAll(".bar")
                  .data(scope.data)
                .enter().append("rect")
                  .attr("class", "d3bar")
                  .attr("x", function(d) { return x(d.letter); })
                  .attr("width", x.rangeBand())
                  .attr("y", function(d) { return y(d.frequency); })
                  .attr("height", function(d) { return height - y(d.frequency); })
                  .on('mouseover', tip.show)
                  .on('mouseout', tip.hide)
                  .on('click', function(d){ tip.hide(); scope.build_search(d.letter);});
          }
        }
      };
    });
  });
