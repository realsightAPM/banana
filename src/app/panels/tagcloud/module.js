/*
  ## tagcloud

  ### Parameters
  * size :: top N
  * alignment :: How should I arrange the words in cloud 'horizontal and vertical' or 'Random'
  * fontScale :: Increase the font scale for all words
  * ignoreStopWords :: Whether to Ignore Stop Words
*/
define([
    'angular',
    'app',
    'underscore',
    'jquery',
    'kbn',
    'd3',
    './d3.layout.cloud',
    './stopWords'
  ],
  function(angular, app, _, $, kbn, d3) {
    'use strict';

    var module = angular.module('kibana.panels.tagcloud', []);
    app.useModule(module);

    module.controller('tagcloud', function($scope,$translate, querySrv, dashboard, filterSrv) {
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
          ids: [],
          query: '*:*',
          custom: ''
        },
        field: '',
        size: 10,
          linkage_id:'a',
          display:'block',
          icon:"icon-caret-down",
        alignment: 'vertical and horizontal',
        fontScale: 1,
        ignoreStopWords: false,
        spyable: true,
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
          if(($scope.panel.linkage_id === dashboard.current.linkage_id)||dashboard.current.enable_linkage){
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

          // Build Solr query
          var fq = '';
          if (filterSrv.getSolrFq()) {
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
//          var k = 0;
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

                      // if ignoreStopWords is enabled, skip this term.
                      if ($scope.panel.ignoreStopWords && (stopwords.indexOf(term.toLowerCase()) > -1)) {
                          continue;
                      }

                      if (term === null) {
                          missing = count;
                      } else {
                          // if count = 0, do not add it to the chart, just skip it
                          if (count === 0) {
                              continue;
                          }
                          var slice = {
                              label: term,
                              data: count,
                              actions: true
                          };
                          if (count / $scope.hits > $scope.maxRatio) {
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

    module.directive('tagcloudChart', function(/*querySrv, dashboard, filterSrv*/) {
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

            function draw(words) {
              d3.select(el).append("svg")
                .attr("width", width)
                .attr("height", height)
                .append("g")
                .attr("transform", "translate(" + (width - 20) / 2 + "," + (height - 20) / 2 + ")")
                .selectAll("text")
                .data(words)
                .enter().append("text")
                .style("font-size", function(d) {
                  return d.size + "px";
                })
                .style("font-family", "Impact, Haettenschweiler, 'Franklin Gothic Bold', Charcoal, 'Helvetica Inserat', 'Bitstream Vera Sans Bold', 'Arial Black', 'sans-serif'")
                .style("fill", function(d, i) {
                  //return  color(i);
                  return fill(i);
                })
                .attr("text-anchor", "middle")
                .attr("transform", function(d) {
                  return "translate(" + [d.x, d.y] + ")rotate(" + d.rotate + ")";
                })
                .text(function(d) {
                  return d.text;
                });
            }

            element.html("");

            var el = element[0];
            var width = element.parent().width();
            var divHeight=scope.panel.height||scope.row.height;
            if(!scope.panel.useInitHeight){
              divHeight = scope.panel.fullHeight;
            }

            var height = parseInt(divHeight);

            var fill = d3.scale.category20();
/*
            var color = d3.scale.linear()
              .domain([0, 1, 2, 3, 4, 5, 6, 10, 15, 20, 100])
              .range(["#7EB26D", "#EAB839", "#6ED0E0", "#EF843C", "#E24D42", "#1F78C1", "#BA43A9", "#705DA0", "#890F02", "#0A437C", "#6D1F62", "#584477"]);
*/

            var scale = d3.scale.linear().domain([0, scope.maxRatio]).range([0, 30]);
            var randomRotate = d3.scale.linear().domain([0, 1]).range([-90, 90]);

            d3.layout.cloud().size([width - 20, height - 20])
              .words(scope.data.map(function(d) {
                return {
                  text: d.label,
                  size: 5 + scale(d.data / scope.hits) + parseInt(scope.panel.fontScale)
                };
              })).rotate(function() {
                if (scope.panel.alignment === 'vertical and horizontal') {
                  return~~ (Math.random() * 2) * -90;
                } else if (scope.panel.alignment === 'horizontal') {
                  return 0;
                }
                else if (scope.panel.alignment === 'vertical(+90)') {
                  return 90;
                }
                else if (scope.panel.alignment === 'vertical(-90)') {
                  return -90;
				}
                else {
                  return randomRotate(Math.random());
                }
              })
              .font("sans-serif")
              .fontSize(function(d) {
                return d.size;
              })
              .on("end", draw)
              .start();


          }

        }
      };
    });

  });
