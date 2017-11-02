/*
  ## pies

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
  'stats',
  'binaryheap'


],
function (angular, app, _, $, kbn) {
  'use strict';

  var module = angular.module('kibana.panels.pies', []);
  app.useModule(module);

  module.controller('pointcloud', function($scope, $timeout, $translate,timer, querySrv, dashboard, filterSrv) {
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
      panelExpand:true,
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
      tilt    : false,
      display:'block',
     fullHeight:'700%',
     useInitHeight:true,
      icon:"icon-caret-down",
      labels  : true,
	  ylabels :true,
      logAxis : false,
      pageName:"pageName",
      arrangement : 'vertical',
	  RoseType	  : 'area',
      chart       : 'pie',
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
      }
    };
    _.defaults($scope.panel,_d);

    $scope.init = function () {
      $scope.hits = 0;

      //$scope.testMultivalued();


      // $('.fullscreen-link').on('click', function () {
      //
      //
      // });

      // Fullscreen ibox function




      // Start refresh timer if enabled
      if ($scope.panel.refresh.enable) {
        $scope.set_timer($scope.panel.refresh.interval);
      }

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
      $scope.panel.fullHeight = ibox[0].offsetHeight-60;
      $scope.$emit('render');
      $(window).trigger('resize');


    };

    //快捷键+控制放大缩小panel
    $scope.zoomOut=function() {
      if(window.event.keyCode===107){
        $scope.reSize();
      }


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
    $scope.build_query = function(filetype, isForExport) {

      // Build Solr query
      var fq = '';

      if (filterSrv.getSolrFq()) {
        fq = '&' + filterSrv.getSolrFq();
          if(!$scope.panel.defaulttimestamp){
              fq = fq.replace(filterSrv.getTimeField(),$scope.panel.value_sort);
          }
      }
      var wt_json = '&wt=' + filetype;
      var rows_limit = isForExport ? '&rows=0' : ''; // for pies, we do not need the actual response doc, so set rows=0
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


      //$('#'+$scope.$id+'a').addClass('sk-loading');
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

        var query = this.build_query('json', false);

        // Set the panel's query
        $scope.panel.queries.query = query;

        request.setQuery('');

        results = request.doSearch();

        // Populate scope when we have results
        results.then(function (results) {
            // Check for error and abort if found
            // if (!(_.isUndefined(results.error))) {
            //     $scope.panel.error = $scope.parse_error(results.error.msg);
            //     $scope.data = [];
            //     $scope.label = [];
            //     // $scope.panelMeta.loading = false;
            //     $scope.$emit('render');
            //     return;
            // }
            //
            // // Function for validating HTML color by assign it to a dummy <div id="colorTest">
            // // and let the browser do the work of validation.
            // /*var isValidHTMLColor = function (color) {
            //     // clear attr first, before comparison
            //     $('#colorTest').removeAttr('style');
            //     var valid = $('#colorTest').css('color');
            //     $('#colorTest').css('color', color);
            //
            //     if (valid === $('#colorTest').css('color')) {
            //         return false;
            //     } else {
            //         return true;
            //     }
            // };*/
            //
            // // Function for customizing chart color by using field values as colors.
            // /*
            // var addSliceColor = function (slice, color) {
            //     if ($scope.panel.useColorFromField && isValidHTMLColor(color)) {
            //         slice.color = color;
            //     }
            //     return slice;
            // };
            // */
            //
            // var sum = 0;
            // var k = 0;
            // var missing = 0;
            // // $scope.panelMeta.loading = false;
            // $scope.hits = results.response.numFound;
            // $scope.data = [];
            // $scope.label = [];
            // $scope.radardata = [];
            // $scope.maxdata = 0;
            //
            //
            // if ($scope.panel.mode === 'count') {
            //     // In count mode, the y-axis min should be zero because count value cannot be negative.
            //     $scope.yaxis_min = 0;
            //
            //     _.each(results.facet_counts.facet_fields, function (v) {
            //         for (var i = 0; i < v.length; i++) {
            //             var term = v[i];
            //             i++;
            //             var count = v[i];
            //
            //             sum += count;
            //             if (term === null) {
            //                 missing = count;
            //             } else {
            //                 if ($scope.maxdata < count) {
            //                     $scope.maxdata = count;
            //                 }
            //                 // if count = 0, do not add it to the chart, just skip it
            //                 if (count === 0) {
            //                     continue;
            //                 }
            //                 term = term.replace(/[\r\n]/g, "");
            //
            //                 var slice = {value: count, name: term};
            //                 $scope.label.push(term);
            //                 $scope.data.push(slice);
            //                 $scope.radardata.push(count);
            //             }
            //         }
            //     });
            // } else {
            //     // In stats mode, set y-axis min to null so jquery.flot will set the scale automatically.
            //     $scope.yaxis_min = null;
            //     _.each(results.stats.stats_fields[$scope.panel.stats_field].facets[$scope.panel.field], function (stats_obj, facet_field) {
            //         var slice = {label: facet_field, data: [[k, stats_obj[$scope.panel.mode]]], actions: true};
            //         $scope.data.push(slice);
            //     });
            // }
            // // Sort the results
            // $scope.data = _.sortBy($scope.data, function (d) {
            //     return $scope.panel.sortBy === 'index' ? d.name : d.value;
            // });
            // if ($scope.panel.order === 'descending') {
            //     $scope.data.reverse();
            //     $scope.label.reverse();
            //     $scope.radardata.reverse();
            // }
            //
            // // Slice it according to panel.size, and then set the x-axis values with k.
            // // $scope.data = $scope.data.slice(0,$scope.panel.size);
            // //_.each($scope.data, function(v) {
            // // v.data[0][0] = k;
            // // k++;
            // // });
            //
            // if ($scope.panel.field && $scope.fields.typeList[$scope.panel.field] && $scope.fields.typeList[$scope.panel.field].schema.indexOf("T") > -1) {
            //     $scope.hits = sum;
            // }
            //
            // // $scope.data.push({label:'Missing field',
            // // data:[[k,results.facets.pies.missing]],meta:"missing",color:'#aaa',opacity:0});
            // // TODO: Hard coded to 0 for now. Solr faceting does not provide 'missing' value.
            // //data:[[k,missing]],meta:"missing",color:'#aaa',opacity:0});
            // //  $scope.data.push({label:'Other values',
            // // data:[[k+1,results.facets.pies.other]],meta:"other",color:'#444'});
            // // TODO: Hard coded to 0 for now. Solr faceting does not provide 'other' value.
            // // data:[[k+1,$scope.hits-sum]],meta:"other",color:'#444'});

            $scope.$emit('render');
        });
    }
    };

    $scope.build_search = function(term,negate) {
            if (_.isUndefined(term.meta)) {
                filterSrv.set({
                    type: 'terms', field: $scope.panel.field, value: term.name,
                    mandate: (negate ? 'mustNot' : 'must')
                });
            } else if (term.meta === 'missing') {
                filterSrv.set({
                    type: 'exists', field: $scope.panel.field,
                    mandate: (negate ? 'must' : 'mustNot')
                });
            } else {
                return;
            }
            dashboard.current.linkage_id = $scope.panel.linkage_id;
            dashboard.current.enable_linkage = false;
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
      $scope.panel.init_height = $scope.panel.height;
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

  module.directive('pointcloudChart', function(querySrv,dashboard,filterSrv) {
    return {
      restrict: 'A',
      link: function(scope, elem) {

        // Receive render events
        scope.$on('render',function(){
          render_panel();
        });

        // Re-render if the window is resized
        // $(window).resize(function() {
        //   render_panel();
        // });
        angular.element(window).bind('resize', function(){
          if(window.innerWidth<500){
            dashboard.current.mobile =true;
          }else {
            dashboard.current.mobile =false;
          }
          render_panel();
        });

        // Function for rendering panel
        function render_panel() {

          scope.panelMeta.loading = false;
          // IE doesn't work without this
          var divHeight=scope.panel.height||scope.row.height;
          if(!scope.panel.useInitHeight){
            divHeight = scope.panel.fullHeight;
          }
            elem.css({height:divHeight});

          // Make a clone we can operate on.


          var idd = scope.$id;
          if(typeof(window.viewer)=="undefined") {
            window.viewer = new Potree.Viewer(document.getElementById(idd));

            viewer.setPointBudget(5*1000*1000);
            viewer.setMinNodeSize(0);
            viewer.setBackground("skybox");
            //$('#'+idd+'a').removeClass('sk-loading');
            Potree.loadPointCloud("vendor/pointcloud/"+scope.panel.pageName+"/cloud.js", "pageName",function (e) {
             var pointcloud = e.pointcloud;
             var  material = pointcloud.material;
            viewer.scene.addPointCloud(pointcloud);
            material.pointColorType = Potree.PointColorType.RGB; // any Potree.PointColorType.XXXX
            material.size = 1;
            material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
            material.shape = Potree.PointShape.SQUARE;
            viewer.fitToScreen();
          });

          }
        }
      }
    };
  });

});
