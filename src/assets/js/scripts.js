
jQuery(document).ready(function() {
    var realUsername = "";
    var realPassword = "";
    $.getJSON('assets/json/login.json', function(data){
        realUsername =data.username;
        realPassword = data.password;
    });
    /*
        Fullscreen background
    */
    $.backstretch([
	 "assets/img/backgrounds/6.jpg"
                  // , "assets/img/backgrounds/2.jpg"
	            //  , "assets/img/backgrounds/3.jpg"
	             // , "assets/img/backgrounds/1.jpg"
                  
        // , "assets/img/backgrounds/5.png"
	             ], {duration: 3000, fade: 750});
    
    /*
        Form validation
    */
    $('.login-form input[type="text"], .login-form input[type="password"], .login-form textarea').on('focus', function() {
      ;

    //   $('.login-form').on('submit', function(e) {
    //     var username = $(this).find('input[type="text"]').val();
    //     var password = $(this).find('input[type="password"]').val();
    //     if($(this).find('input[type="text"]').val()==""){
    //       e.preventDefault();
    //       $(this).find('input[type="text"]').addClass('input-error');
    //     }
    //     if($(this).find('input[type="password"]').val()==""){
    //       e.preventDefault();
    //       $(this).find('input[type="password"]').addClass('input-error');
    //     }
    //     if(username ==realUsername&&password ==realPassword){
    //       //sessionStorage.setItem(username,password);
    //       var goalUrlName = sessionStorage.getItem("goalUrl");
    //       $.cookie("rmbUser", "true");
    //       $.cookie("rtd_username", username);
    //       $.cookie("rtd_password", password);
    //       $(this).find('input[type="password"]').removeClass('input-error');
    //       var url =window.location.href;
    //       if(goalUrlName==null){
    //         goalUrlName = '#';
    //       }
    //       document.login.action="./"+goalUrlName;
    //     }else{
    //       e.preventDefault();
    //       $(this).find('input[type="text"]').addClass('input-error');
    //       $(this).find('input[type="password"]').addClass('input-error');
    //       document.getElementById("remind_2").innerHTML = "用户名或密码错误，请重新输入";
    //       document.getElementById("change_margin_3").style.marginTop = 2 + "px";
    //     }$(this).removeClass('input-error');
    // })
    	// $(this).find('input[type="text"], input[type="password"], textarea').each(function(){
    	// 	debugger
        //
    	// 	if( $(this).val() == "" ) {
        //
    	// 	}else if(username !="aa"||password!="aa"){
        //
        //
			// }
    	// 	else {
        //
    	// 		$(this).removeClass('input-error');
        //
    	// 	}
    	// });


    });

  $('#login').on('click',function(){
    var username = $('.login-form').find('input[type="text"]').val();
    var password = $('.login-form').find('input[type="password"]').val();
    if($('.login-form').find('input[type="text"]').val()==""){
      e.preventDefault();
      $('.login-form').find('input[type="text"]').addClass('input-error');
    }
    if($('.login-form').find('input[type="password"]').val()==""){
      e.preventDefault();
      $('.login-form').find('input[type="password"]').addClass('input-error');
    }
    if(username ==realUsername&&password ==realPassword){
      //sessionStorage.setItem(username,password);
      var goalUrlName = sessionStorage.getItem("goalUrl");
      $.cookie("rmbUser", "true");
      $.cookie("rtd_username", username);
      $.cookie("rtd_password", password);
      $('.login-form').find('input[type="password"]').removeClass('input-error');
      if(goalUrlName==null){
        goalUrlName = '#';
      }
      window.location.href = window.location.origin+window.location.pathname.replace("login.html",goalUrlName);
      //document.login.action="./"+goalUrlName;
    }else{
      e.preventDefault();
      $('.login-form').find('input[type="text"]').addClass('input-error');
      $('.login-form').find('input[type="password"]').addClass('input-error');
      document.getElementById("remind_2").innerHTML = "用户名或密码错误，请重新输入";
      document.getElementById("change_margin_3").style.marginTop = 2 + "px";
    }
    // $(this).find('input[type="text"], input[type="password"], textarea').each(function(){
    // 	debugger
    //
    // 	if( $(this).val() == "" ) {
    //
    // 	}else if(username !="aa"||password!="aa"){
    //
    //
    // }
    // 	else {
    //
    // 		$(this).removeClass('input-error');
    //
    // 	}
    // });


  })
    
    
});
function oFocus_2() {
    document.getElementById("remind_2").innerHTML = "";
    document.getElementById("change_margin_3").style.marginTop = 19 + "px";
}
function returnUrl() {
    var url =window.location.href;
}

