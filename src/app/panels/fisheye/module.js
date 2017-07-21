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
   'd3',
   'fisheye'
   // 'd3transform',
   //  'extarray',
   // 'misc',
   // 'microobserver',
   // 'microplugin',
   //  'bubble',
   // 'centralclick',
   //  'lines'



],
function (angular, app, _, $, kbn) {
  'use strict';

  var module = angular.module('kibana.panels.d3text', []);
  app.useModule(module);

  module.controller('fisheye', function($scope, $timeout, timer, querySrv, dashboard, filterSrv) {
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
      donut   : false,
      tilt    : false,
        linkage_id:'a',
      labels  : true,
      logAxis : false,
      arrangement : 'horizontal',
      chart       : 'fisheye',
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
      }
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
          if($scope.panel.display=='none'){
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
    $scope.build_query = function(filetype, isForExport) {

      // Build Solr query
      var fq = '';
      if (filterSrv.getSolrFq()) {
        fq = '&' + filterSrv.getSolrFq();
      }
      var wt_json = '&wt=' + filetype;
      var rows_limit = isForExport ? '&rows=0' : ''; // for terms, we do not need the actual response doc, so set rows=0
      var facet = '';

      if ($scope.panel.mode === 'count') {
        facet = '&facet=true&facet.field=' + $scope.panel.field + '&facet.limit=' + $scope.panel.size + '&facet.missing=true';
      } else {
        // if mode != 'count' then we need to use stats query
        // stats does not support something like facet.limit, so we have to sort and limit the results manually.
        facet = '&stats=true&stats.facet=' + $scope.panel.field + '&stats.field=' + $scope.panel.stats_field + '&facet.missing=true';
      }
      facet += '&f.' + $scope.panel.field + '.facet.sort=' + ($scope.panel.sortBy || 'count');

      var exclude_length = $scope.panel.exclude.length;
      var exclude_filter = '';
      if(exclude_length > 0){
        for (var i = 0; i < exclude_length; i++) {
          if($scope.panel.exclude[i] !== "") {
            exclude_filter += '&fq=-' + $scope.panel.field +":"+ $scope.panel.exclude[i];
          }
        }
      }

      return querySrv.getORquery() + wt_json + rows_limit + fq + exclude_filter + facet + ($scope.panel.queries.custom != null ? $scope.panel.queries.custom : '');
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
        if(($scope.panel.linkage_id==dashboard.current.linkage_id)||dashboard.current.enable_linkage){
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

        var query = this.build_query('json', false);

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

            // Function for validating HTML color by assign it to a dummy <div id="colorTest">
            // and let the browser do the work of validation.
            var isValidHTMLColor = function (color) {
                // clear attr first, before comparison
                $('#colorTest').removeAttr('style');
                var valid = $('#colorTest').css('color');
                $('#colorTest').css('color', color);

                if (valid === $('#colorTest').css('color')) {
                    return false;
                } else {
                    return true;
                }
            };

            // Function for customizing chart color by using field values as colors.
            var addSliceColor = function (slice, color) {
                if ($scope.panel.useColorFromField && isValidHTMLColor(color)) {
                    slice.color = color;
                }
                return slice;
            };

            var sum = 0;
            var k = 0;
            var missing = 0;
            $scope.panelMeta.loading = false;
            $scope.hits = results.response.numFound;
            $scope.data = [];

            if ($scope.panel.mode === 'count') {
                // In count mode, the y-axis min should be zero because count value cannot be negative.
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
                            var slice = {label: term, data: [[k, count]], actions: true};
                            slice = addSliceColor(slice, term);
                            $scope.data.push(slice);
                        }
                    }
                });
            } else {
                // In stats mode, set y-axis min to null so jquery.flot will set the scale automatically.
                $scope.yaxis_min = null;
                _.each(results.stats.stats_fields[$scope.panel.stats_field].facets[$scope.panel.field], function (stats_obj, facet_field) {
                    var slice = {label: facet_field, data: [[k, stats_obj[$scope.panel.mode]]], actions: true};
                    $scope.data.push(slice);
                });
            }
            // Sort the results
            $scope.data = _.sortBy($scope.data, function (d) {
                return $scope.panel.sortBy === 'index' ? d.label : d.data[0][1];
            });
            if ($scope.panel.order === 'descending') {
                $scope.data.reverse();
            }

            // Slice it according to panel.size, and then set the x-axis values with k.
            $scope.data = $scope.data.slice(0, $scope.panel.size);
            _.each($scope.data, function (v) {
                v.data[0][0] = k;
                k++;
            });

            if ($scope.panel.field && $scope.fields.typeList[$scope.panel.field] && $scope.fields.typeList[$scope.panel.field].schema.indexOf("T") > -1) {
                $scope.hits = sum;
            }

            $scope.data.push({
                label: 'Missing field',
                // data:[[k,results.facets.terms.missing]],meta:"missing",color:'#aaa',opacity:0});
                // TODO: Hard coded to 0 for now. Solr faceting does not provide 'missing' value.
                data: [[k, missing]], meta: "missing", color: '#aaa', opacity: 0
            });
            $scope.data.push({
                label: 'Other values',
                // data:[[k+1,results.facets.terms.other]],meta:"other",color:'#444'});
                // TODO: Hard coded to 0 for now. Solr faceting does not provide 'other' value.
                data: [[k + 1, $scope.hits - sum]], meta: "other", color: '#444'
            });

            $scope.$emit('render');
        });
    }
    };

    $scope.build_search = function(term,negate) {
      if(_.isUndefined(term.meta)) {
		  if($scope.panel.chart === 'ebar'){filterSrv.set({type:'terms',field:$scope.panel.field,value:term.name,
          mandate:(negate ? 'mustNot':'must')});}else{
        filterSrv.set({type:'terms',field:$scope.panel.field,value:term.label,
          mandate:(negate ? 'mustNot':'must')});}
      } else if(term.meta === 'missing') {
        filterSrv.set({type:'exists',field:$scope.panel.field,
          mandate:(negate ? 'must':'mustNot')});
      } else {
        return;
      }
      dashboard.refresh();
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

  module.directive('fisheyeChart', function(querySrv,dashboard,filterSrv) {
    return {
      restrict: 'A',
      link: function(scope, elem) {

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

            elem.html("");

            var el = elem[0];


            var parent_width = elem.parent().width(),
                height = parseInt(scope.panel.height),
                padding = 50,
                outerRadius = height / 2 - 30,
                innerRadius = outerRadius / 3;

            var margin = {
                    top: 20,
                    right: 20,
                    bottom: 100,
                    left: 50
                },
                width = parent_width - margin.left - margin.right;


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

            if (filterSrv.idsByTypeAndField('terms', scope.panel.field).length > 0) {
                colors.push(scope.panel.lastColor);
            } else {
                colors = scope.panel.chartColors;
            }

          var x;
          var y;
          var radius;
          var color;
          var position;
            require([], function(){
            // Populate element
            try {

                var labelcolor = false;
              if (dashboard.current.style === 'dark'||dashboard.current.style === 'black'){
                    labelcolor = true;
                }
                // Add plot to scope so we can build out own legend


                if (scope.panel.chart === 'fisheye') {
                  x=function(d) { return d.income; }
                  y=function(d) { return d.lifeExpectancy; }
                  radius=function(d) { return d.population; }
                  color=function(d) { return d.region; }

                  // Chart dimensions.
                  var margin = {top: 5.5, right: 19.5, bottom: 12.5, left: 39.5},
                    width = 0.96*elem.parent().width(),
                    height = parseInt(scope.panel.height) - margin.top - margin.bottom;

                  // Various scales and distortions.
                  var xScale = d3.fisheye.scale(d3.scale.log).domain([300, 1e5]).range([0, width]),
                    yScale = d3.fisheye.scale(d3.scale.linear).domain([20, 90]).range([height, 0]),
                    radiusScale = d3.scale.sqrt().domain([0, 5e8]).range([0, 40]),
                    colorScale = d3.scale.category10().domain(["Sub-Saharan Africa", "South Asia", "Middle East & North Africa", "America", "Europe & Central Asia", "East Asia & Pacific"]);

                  // The x & y axes.
                  var xAxis = d3.svg.axis().orient("bottom").scale(xScale).tickFormat(d3.format(",d")).tickSize(-height),
                    yAxis = d3.svg.axis().scale(yScale).orient("left").tickSize(-width);

                  // Create the SVG container and set the origin.
                  var svg = d3.select(el).append("svg")
                    .attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom)
                    .append("g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

                  // Add a background rect for mousemove.
                  svg.append("rect")
                    .attr("class", "background")
                    .attr("width", width)
                    .attr("height", height);

                  // Add the x-axis.
                  svg.append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(0," + height + ")")
                    .call(xAxis);

                  // Add the y-axis.
                  svg.append("g")
                    .attr("class", "y axis")
                    .call(yAxis);

                  // Add an x-axis label.
                  svg.append("text")
                    .attr("class", "x label")
                    .attr("text-anchor", "end")
                    .attr("x", width - 6)
                    .attr("y", height - 6)
                    .text("income per capita, inflation-adjusted (dollars)");

                  // Add a y-axis label.
                  svg.append("text")
                    .attr("class", "y label")
                    .attr("text-anchor", "end")
                    .attr("x", -6)
                    .attr("y", 6)
                    .attr("dy", ".75em")
                    .attr("transform", "rotate(-90)")
                    .text("life expectancy (years)");

                  // Load the data.
                  d3.json("vendor/d3/fisheye/nations.json", function(nations) {

                    // Add a dot per nation. Initialize the data at 1800, and set the colors.
                    var dot = svg.append("g")
                      .attr("class", "dots")
                      .selectAll(".dot")
                      .data(nations)
                      .enter().append("circle")
                      .attr("class", "dot")
                      .style("fill", function(d) { return colorScale(color(d)); })
                      .call(position)
                      .sort(function(a, b) { return radius(b) - radius(a); });

                    // Add a title.
                    dot.append("title")
                      .text(function(d) { return d.name; });

                    // Positions the dots based on data.
                    function position(dot) {
                      dot .attr("cx", function(d) { return xScale(x(d)); })
                        .attr("cy", function(d) { return yScale(y(d)); })
                        .attr("r", function(d) { return radiusScale(radius(d)); });
                    }

                    svg.on("mousemove", function() {
                      var mouse = d3.mouse(this);
                      xScale.distortion(2.5).focus(mouse[0]);
                      yScale.distortion(2.5).focus(mouse[1]);

                      dot.call(position);
                      svg.select(".x.axis").call(xAxis);
                      svg.select(".y.axis").call(yAxis);
                    });
                  });
                }


                // Populate legend


            } catch (e) {
                elem.text(e);
            }
        });
        }



      }
    };
  });

});
