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
  'echarts-liquidfill'
],
function (angular, app, _, $, kbn) {
  'use strict';

  var module = angular.module('kibana.panels.pies', []);
  app.useModule(module);

  module.controller('infoalarm', function($scope, $timeout, $translate,timer, querySrv, dashboard, filterSrv) {
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
      div_style:'2px solid #000',
      size    : 10000,
      sortBy  : 'count',
      order   : 'descending',
      fontsize : 20,
      donut   : false,
      tilt    : false,
      display:'block',

      icon:"icon-caret-down",
      labels  : true,
	  ylabels :true,
      logAxis : false,
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
                $scope.label = [];
                $scope.panelMeta.loading = false;
                $scope.$emit('render');
                return;
            }

            // Function for validating HTML color by assign it to a dummy <div id="colorTest">
            // and let the browser do the work of validation.


            // Function for customizing chart color by using field values as colors.


            var sum = 0;
            var k = 0;
            var missing = 0;
            $scope.panelMeta.loading = false;
            $scope.hits = results.response.numFound;
            $scope.data = [];
            $scope.label = [];
            $scope.radardata = [];
            $scope.maxdata = 0;


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
                            if ($scope.maxdata < count) {
                                $scope.maxdata = count;
                            }
                            // if count = 0, do not add it to the chart, just skip it
                            if (count === 0) {
                                continue;
                            }
                            term = term.replace(/[\r\n]/g, "");

                            var slice = {value: count, name: term};
                            $scope.label.push(term);
                            $scope.data.push(slice);
                            $scope.radardata.push(count);
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
                return $scope.panel.sortBy === 'index' ? d.name : d.value;
            });
            if ($scope.panel.order === 'descending') {
                $scope.data.reverse();
                $scope.label.reverse();
                $scope.radardata.reverse();
            }

            // Slice it according to panel.size, and then set the x-axis values with k.
            // $scope.data = $scope.data.slice(0,$scope.panel.size);
            //_.each($scope.data, function(v) {
            // v.data[0][0] = k;
            // k++;
            // });

            if ($scope.panel.field && $scope.fields.typeList[$scope.panel.field] && $scope.fields.typeList[$scope.panel.field].schema.indexOf("T") > -1) {
                $scope.hits = sum;
            }

            // $scope.data.push({label:'Missing field',
            // data:[[k,results.facets.pies.missing]],meta:"missing",color:'#aaa',opacity:0});
            // TODO: Hard coded to 0 for now. Solr faceting does not provide 'missing' value.
            //data:[[k,missing]],meta:"missing",color:'#aaa',opacity:0});
            //  $scope.data.push({label:'Other values',
            // data:[[k+1,results.facets.pies.other]],meta:"other",color:'#444'});
            // TODO: Hard coded to 0 for now. Solr faceting does not provide 'other' value.
            // data:[[k+1,$scope.hits-sum]],meta:"other",color:'#444'});
            if($scope.data.length>0){
              $scope.panel.div_style = '2px solid #FF0000';
            }else{
              $scope.panel.div_style = '0px solid #FF0000';
            }
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

  module.directive('infoalarmChart', function(querySrv,dashboard,filterSrv) {
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

          var colors = [];

          // IE doesn't work without this
            elem.css({height:scope.panel.height||scope.row.height});

          // Make a clone we can operate on.
		  
        

          if (filterSrv.idsByTypeAndField('pies',scope.panel.field).length > 0) {
            colors.push(scope.panel.lastColor);
          } else {
            colors = scope.panel.chartColors;
          }

		

		var idd = scope.$id;
          require(['echarts'], function(ec){
            var echarts = ec;
            if(myChart) {
              myChart.dispose();
            }
            // Populate element
            try {
				 var labelcolor = false;
              if (dashboard.current.style === 'dark'||dashboard.current.style === 'black'){
							labelcolor = true;
						}
              // Add plot to scope so we can build out own legend

	       var error_sum =0;
        for(var i0=0;i0<scope.data.length;i0++){
          error_sum+=scope.data[i0].value;
        }
                myChart = echarts.init(document.getElementById(idd));
                var option8 = {

                  series: [
                    {
                    animation: true,
                    waveAnimation: true,
                    itemStyle: {
                      normal: {
                        shadowBlur: 0
                      }
                    },
                    center: ['18%', '40%'],
                    radius: '40%',
                    backgroundStyle: {
                      color: 'none',
                      borderColor: '#696969',
                      borderWidth: 1
                    },
                    type: 'liquidFill',
                    shape:"path://M142.685723 507.829004l118.626771 0c11.30344 0 20.451798-8.904811 20.451798-19.986193 0-11.05887-9.149381-20.451798-20.451798-20.451798L142.685723 467.391013c-11.546987 0-20.208251 9.392928-20.208251 20.451798C122.477472 498.924193 131.138736 507.829004 142.685723 507.829004L142.685723 507.829004zM142.685723 433.259658 142.685723 433.259658l118.626771 0c11.30344 0 20.451798-8.927323 20.451798-19.986193 0-11.5695-9.149381-20.451798-20.451798-20.451798L142.685723 392.821667c-11.546987 0-20.208251 8.882298-20.208251 20.451798C122.477472 424.332335 131.138736 433.259658 142.685723 433.259658L142.685723 433.259658zM961.678606 173.400259 961.678606 173.400259l-244.447385 0L717.231221 104.338347c0-18.519796-15.389502-34.175357-33.909297-34.175357L340.922646 70.162989c-18.765389 0-33.665751 15.655562-33.665751 34.175357l0 69.061912L62.809511 173.400259c-18.785855 0-34.175357 15.389502-34.175357 34.153868l0 661.905148c0 18.519796 15.389502 33.664727 34.175357 33.664727l244.447385 0 0 14.678304c0 18.542308 14.900362 34.153868 33.665751 34.153868l342.399277 0c18.519796 0 33.909297-15.611559 33.909297-34.153868l0-14.678304 244.447385 0c18.764366 0 33.68724-15.144932 33.68724-33.664727l0-661.905148C995.365846 188.789761 980.442972 173.400259 961.678606 173.400259L961.678606 173.400259zM307.256896 835.283918 307.256896 835.283918 96.474238 835.283918 96.474238 241.262856l210.782657 0L307.256896 835.283918 307.256896 835.283918zM649.391137 884.116089 649.391137 884.116089 375.098004 884.116089 375.098004 138.270157l274.293133 0L649.391137 884.116089 649.391137 884.116089zM927.503249 835.283918 927.503249 835.283918 717.231221 835.283918 717.231221 241.262856l210.272028 0L927.503249 835.283918 927.503249 835.283918zM142.685723 358.64631 142.685723 358.64631l118.626771 0c11.30344 0 20.451798-8.882298 20.451798-19.963681 0-11.304464-9.149381-20.430308-20.451798-20.430308L142.685723 318.252321c-11.546987 0-20.208251 9.124821-20.208251 20.430308C122.477472 349.764012 131.138736 358.64631 142.685723 358.64631L142.685723 358.64631zM255.516488 667.357324 255.516488 667.357324c-13.701047-13.966083-32.709983-22.404266-53.628408-22.404266-20.940938 0-39.948851 8.438183-53.428863 22.404266-13.723559 13.437034-22.140253 32.222889-22.140253 53.163827 0 20.451798 7.705496 39.21514 20.696368 52.451606l1.443885 1.197268c13.480013 13.947663 32.487925 22.385846 53.428863 22.385846 20.918425 0 39.927361-8.438183 53.628408-22.385846 13.723559-13.477966 22.3838-32.242332 22.3838-53.648874 0-20.451798-8.172123-38.508036-21.184485-52.207036L255.516488 667.357324 255.516488 667.357324zM226.670509 745.523591 226.670509 745.523591c-6.040576 6.0416-15.188934 10.349719-24.78243 10.349719-9.882068 0-18.320251-4.308119-24.537859-10.349719l-1.221828-0.709151c-5.773494-6.506181-9.371438-14.433734-9.371438-24.293289 0-9.639544 3.842515-18.054191 10.081613-24.78243l0.51063 0.466628c6.217608-6.728238 14.655791-10.8143 24.537859-10.8143 9.593496 0 18.741853 4.086062 24.78243 10.8143l0.954745 0.488117c5.773494 6.262634 9.371438 14.433734 9.371438 23.827685C236.996692 730.380706 233.154177 739.285516 226.670509 745.523591L226.670509 745.523591zM762.932076 433.259658 762.932076 433.259658l118.848828 0c11.5695 0 20.451798-8.927323 20.451798-19.986193 0-11.5695-8.882298-20.451798-20.451798-20.451798L762.932076 392.821667c-11.546987 0-20.451798 8.882298-20.451798 20.451798C742.480278 424.332335 751.384066 433.259658 762.932076 433.259658L762.932076 433.259658zM762.932076 507.829004 762.932076 507.829004l118.848828 0c11.5695 0 20.451798-8.904811 20.451798-19.986193 0-11.05887-8.882298-20.451798-20.451798-20.451798L762.932076 467.391013c-11.546987 0-20.451798 9.392928-20.451798 20.451798C742.480278 498.924193 751.384066 507.829004 762.932076 507.829004L762.932076 507.829004zM762.932076 358.64631 762.932076 358.64631l118.848828 0c11.5695 0 20.451798-8.882298 20.451798-19.963681 0-11.304464-8.882298-20.430308-20.451798-20.430308L762.932076 318.252321c-11.546987 0-20.451798 9.124821-20.451798 20.430308C742.480278 349.764012 751.384066 358.64631 762.932076 358.64631L762.932076 358.64631zM439.118086 469.100958 439.118086 469.100958l146.007375 0c11.32493 0 20.451798-8.928347 20.451798-20.451798 0-11.081383-9.126868-20.453844-20.451798-20.453844L439.118086 428.195316c-11.5695 0-20.473287 9.372461-20.473287 20.453844C418.644799 460.171588 427.548586 469.100958 439.118086 469.100958L439.118086 469.100958zM876.0289 667.357324 876.0289 667.357324c-13.723559-13.966083-32.732495-22.404266-53.91698-22.404266-20.673855 0-39.927361 8.438183-53.40635 22.404266-13.4575 13.437034-22.11774 32.222889-22.11774 53.163827 0 20.451798 8.172123 39.21514 21.162995 52.451606l0.954745 1.197268c13.478989 13.947663 32.732495 22.385846 53.40635 22.385846 21.184485 0 40.193421-8.438183 53.91698-22.385846 13.478989-13.477966 22.11774-32.242332 22.11774-53.648874 0-20.451798-7.682983-38.508036-21.161972-52.207036L876.0289 667.357324 876.0289 667.357324zM847.13892 745.523591 847.13892 745.523591c-6.240121 6.0416-14.900362 10.349719-25.027 10.349719-9.126868 0-18.276249-4.308119-24.537859-10.349719l-0.954745-0.709151c-5.773494-6.506181-9.614985-14.433734-9.614985-24.293289 0-9.639544 3.841491-18.054191 10.570753-24.78243l0 0.466628c6.262634-6.728238 15.410991-10.8143 24.537859-10.8143 10.125615 0 18.786878 4.086062 25.027 10.8143l0.978281 0.488117c5.773494 6.262634 9.370415 14.433734 9.370415 23.827685C857.486592 730.380706 853.889671 739.285516 847.13892 745.523591L847.13892 745.523591zM439.118086 285.742906 439.118086 285.742906l146.007375 0c11.32493 0 20.451798-8.882298 20.451798-20.208251 0-11.30344-9.126868-20.185738-20.451798-20.185738L439.118086 245.348917c-11.5695 0-20.473287 8.882298-20.473287 20.185738C418.644799 276.859585 427.548586 285.742906 439.118086 285.742906L439.118086 285.742906zM439.118086 377.676735 439.118086 377.676735l146.007375 0c11.32493 0 20.451798-9.392928 20.451798-20.451798 0-11.30344-9.126868-19.986193-20.451798-19.986193L439.118086 337.238744c-11.5695 0-20.473287 8.682753-20.473287 19.986193C418.644799 368.283808 427.548586 377.676735 439.118086 377.676735L439.118086 377.676735zM575.754023 673.821549 575.754023 673.821549l-1.199315-0.710175c-16.122189-16.344247-37.794791-26.203802-62.333674-26.203802-23.782659 0-45.700855 9.346879-61.578474 24.759917l-0.954745 1.443885c-15.877619 15.410991-25.981744 37.771255-25.981744 62.555731 0 24.537859 10.104125 46.699602 25.981744 62.089104 15.877619 16.365736 37.995359 26.203802 62.533218 26.203802 24.537859 0 46.211485-10.081613 62.333674-26.203802l0 0c16.122189-15.389502 26.225291-37.551244 26.225291-62.089104C600.781022 711.593827 591.143525 689.965228 575.754023 673.821549L575.754023 673.821549zM545.930787 768.886695 545.930787 768.886695c-8.66024 8.882298-20.695345 14.433734-33.709753 14.433734-13.4575 0-25.492604-5.551436-33.664727-13.96813l-0.466628 0 0.466628-0.466628c-8.904811-8.194636-14.433734-20.22974-14.433734-33.220612 0-13.478989 5.528923-25.492604 14.433734-33.68724l0.48914-0.954745c8.637728-8.416693 20.450774-13.478989 33.175587-13.478989 13.478989 0 25.048489 5.551436 33.709753 14.433734l0.954745 0.488117c8.194636 8.414647 12.991895 19.961634 12.991895 33.1981C559.877427 748.656955 554.592051 760.693082 545.930787 768.886695L545.930787 768.886695z",
                    data:[0.8, 0.6, 0.3],
                    outline: {
                      show: false
                    },
                    label: {
                      normal: {
                        position: 'bottom',
                        // formatter: '应用总数:'+scope.data.length+"个",
                        formatter: '存储:'+scope.data.length+"个",
                        textStyle: {
                          color: '#178ad9',
                          fontSize: scope.panel.fontsize
                        }
                      }
                    }
                  }, {
                      animation: true,
                      waveAnimation: true,
                      itemStyle: {
                        normal: {
                          shadowBlur: 0
                        }
                      },
                      center: ['38%', '40%'],
                      radius: '40%',
                      backgroundStyle: {
                        color: 'none',
                        borderColor: '#696969',
                        borderWidth: 1
                      },
                      type: 'liquidFill',
                      shape:"path://M862.942823 463.578963a47.216309 47.216309 0 0 1 47.22655-47.21631h76.717543V278.615138a76.594664 76.594664 0 0 0-33.218328-63.200838L761.864491 23.599963v0.184319A76.543464 76.543464 0 0 0 698.858212 0.375805H125.186708A76.727783 76.727783 0 0 0 40.963297 76.734951v869.206075a76.727783 76.727783 0 0 0 85.421482 76.236267h705.674421v0.665595h78.120413v-0.174079a76.727783 76.727783 0 0 0 76.717543-76.738023V640.033408h-76.727783a47.216309 47.216309 0 0 1-47.21631-47.21631V463.578963h-0.01024zM543.170342 318.182221V124.145819a47.20607 47.20607 0 1 1 94.26878 3.727334v194.046642a47.216309 47.216309 0 1 1-94.26878-3.737574z m-188.885718 0.01024v-194.046642a47.20607 47.20607 0 1 1 94.26878 3.717094v194.046642a47.20607 47.20607 0 1 1-94.26878-3.717094z m-188.967637 0v-194.046642a47.226549 47.226549 0 1 1 94.453099 0c0 1.259511-0.071679 2.498543-0.174079 3.717094v194.046642a47.216309 47.216309 0 1 1-94.27902-3.717094zM761.854251 849.992898a47.20607 47.20607 0 0 1-47.216309 47.226549H212.144179v-0.010239a47.216309 47.216309 0 0 1-46.898872-47.21631h-0.317437V711.354509a47.216309 47.216309 0 0 1 47.216309-47.21631l0.04096 0.01024h502.452803a47.20607 47.20607 0 0 1 47.226549 47.20607L761.854251 849.992898z m70.204949 95.948128z",
                      data:[0.8, 0.6, 0.3],
                      outline: {
                        show: false
                      },
                      label: {
                        normal: {
                          position: 'bottom',
                          // formatter: '应用总数:'+scope.data.length+"个",
                          formatter: '内存:'+scope.data.length+"个",
                          textStyle: {
                            color: '#178ad9',
                            fontSize: scope.panel.fontsize
                          }
                        }
                      }
                    }, {
                      animation: true,
                      waveAnimation: true,
                      itemStyle: {
                        normal: {
                          shadowBlur: 0
                        }
                      },
                      center: ['58%', '40%'],
                      radius: '40%',
                      backgroundStyle: {
                        color: 'none',
                        borderColor: '#696969',
                        borderWidth: 1
                      },
                      type: 'liquidFill',
                      shape:"path://M924.140665 828.41344l0 34.409694L820.908512 862.823134l0-34.409694-34.409694 0 0 34.409694-68.821435 0 0-34.409694-34.409694 0 0 34.409694-68.768223 0 0-34.409694L442.443831 828.41344l0 34.409694L304.855196 862.823134l0-34.409694-34.410718 0 0 34.409694L132.801609 862.823134l0-34.409694-34.409694 0c-18.97619 0-34.409694-15.435551-34.409694-34.410718l0-619.284445c0-18.977213 15.434527-34.409694 34.409694-34.409694l516.106528 0L614.498442 105.895819l68.768223 0 0 34.411741 34.409694 0L717.676359 105.895819l68.821435 0 0 34.411741 34.409694 0L820.907489 105.895819l68.820412 0 0 34.411741 34.411741 0c18.97619 0 34.409694 15.433504 34.409694 34.409694l0 619.284445C958.550359 812.977889 943.116855 828.41344 924.140665 828.41344L924.140665 828.41344zM132.801609 174.717254l-34.409694 0 0 34.410718 34.409694 0L132.801609 174.717254 132.801609 174.717254zM132.801609 243.538689l-34.409694 0 0 34.409694 34.409694 0L132.801609 243.538689 132.801609 243.538689zM132.801609 312.360124l-34.409694 0 0 34.356482 34.409694 0L132.801609 312.360124 132.801609 312.360124zM132.801609 381.128347l-34.409694 0 0 34.409694 34.409694 0L132.801609 381.128347 132.801609 381.128347zM132.801609 518.771217l-34.409694 0 0 240.820788 34.409694 0L132.801609 518.771217 132.801609 518.771217zM201.623044 174.717254l-34.409694 0 0 34.410718 34.409694 0L201.623044 174.717254 201.623044 174.717254zM201.623044 725.180264l-34.409694 0 0 34.411741 34.409694 0L201.623044 725.180264 201.623044 725.180264zM270.444479 174.717254l-34.409694 0 0 34.410718 34.409694 0L270.444479 174.717254 270.444479 174.717254zM270.444479 725.180264l-34.409694 0 0 34.411741 34.409694 0L270.444479 725.180264 270.444479 725.180264zM339.265914 174.717254l-34.410718 0 0 34.410718 34.410718 0L339.265914 174.717254 339.265914 174.717254zM476.855572 690.77057c-18.97619 0-34.410718 15.434527-34.410718 34.409694 0 19.029402 15.435551 34.411741 34.410718 34.411741 19.029402 0 34.409694-15.382339 34.409694-34.411741C511.265266 706.205097 495.884974 690.77057 476.855572 690.77057L476.855572 690.77057zM924.140665 346.716606c0-18.97619-15.435551-34.356482-34.411741-34.356482l-309.642223 0c-19.029402 0-34.409694 15.380292-34.409694 34.356482l0 240.873999c0 18.97619 15.380292 34.410718 34.409694 34.410718l309.642223 0c18.97619 0 34.411741-15.435551 34.411741-34.410718L924.140665 346.716606 924.140665 346.716606zM855.31923 587.591629 614.498442 587.591629c-19.029402 0-34.410718-15.434527-34.410718-34.409694L580.087725 381.128347c0-18.977213 15.381315-34.411741 34.410718-34.411741l240.820788 0c18.977213 0 34.409694 15.435551 34.409694 34.411741L889.728924 553.181935C889.728924 572.157101 874.29542 587.591629 855.31923 587.591629L855.31923 587.591629zM683.266665 381.128347l-68.768223 0 0 68.820412 68.768223 0L683.266665 381.128347 683.266665 381.128347zM820.908512 381.128347 717.676359 381.128347l0 68.820412 103.232153 0L820.908512 381.128347 820.908512 381.128347zM820.908512 484.359476 614.498442 484.359476l0 68.821435 206.41007 0L820.908512 484.359476 820.908512 484.359476z",
                      data:[0.8, 0.6, 0.3],
                      outline: {
                        show: false
                      },
                      label: {
                        normal: {
                          position: 'bottom',
                          // formatter: '应用总数:'+scope.data.length+"个",
                          formatter: 'CPU:'+scope.data.length+"个",
                          textStyle: {
                            color: '#178ad9',
                            fontSize: scope.panel.fontsize
                          }
                        }
                      }
                    },
                    {
                      animation: true,
                      waveAnimation: true,
                      itemStyle: {
                        normal: {
                          shadowBlur: 0
                        }
                      },
                      center: ['78%', '40%'],
                      radius: '40%',
                      backgroundStyle: {
                        color: 'none',
                        borderColor: '#696969',
                        borderWidth: 1
                      },
                      type: 'liquidFill',
                      shape:"path://M847.798 621.515c62 0 112.254-50.261 112.254-112.274 0-61.983-50.254-112.245-112.254-112.245-51.166 0-94.251 34.269-107.772 81.075h-280.986l157.301-272.322h123.684c13.522 46.808 56.606 81.077 107.772 81.077 62 0 112.254-50.263 112.254-112.261 0-62-50.254-112.261-112.254-112.261-51.166 0-94.251 34.268-107.772 81.092h-159.676l-193.328 334.675h-104.977c-13.522-46.807-56.604-81.075-107.773-81.075-61.998 0-112.253 50.261-112.253 112.245 0 62.014 50.255 112.274 112.253 112.274 51.17 0 94.251-34.268 107.773-81.091h104.925l193.331 336.768h159.727c13.522 46.823 56.606 81.078 107.772 81.078 62 0 112.254-50.249 112.254-112.26 0-61.983-50.254-112.252-112.254-112.252-51.166 0-94.251 34.274-107.772 81.064h-123.624l-157.532-274.398h281.156c13.522 46.822 56.606 81.091 107.772 81.091z",
                      data:[0.8, 0.6, 0.3],
                      outline: {
                        show: false
                      },
                      label: {
                        normal: {
                          position: 'bottom',
                          // formatter: '应用总数:'+scope.data.length+"个",
                          formatter: '网络:'+scope.data.length+"个",
                          textStyle: {
                            color: '#178ad9',
                            fontSize: scope.panel.fontsize
                          }
                        }
                      }
                    }

                  ],
                  tooltip: {
                    show: false
                  }
                };

                myChart.setOption(option8);




              // Populate legend


            } catch(e) {
              elem.text(e);
            }
          });
        }
      


      

      }
    };
  });

});
