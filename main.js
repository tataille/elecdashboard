const electron = require('electron')
const express    = require('express');
const appExpress = express();                 // define our app using express
const bodyParser = require('body-parser');
const auth = require('http-auth');
const notifier = require('electron-notification-desktop');
const ip = require('ip');
const path = require('path');
const url = require('url');
const loki = require('lokijs');
const parser = require('cron-parser');
const schedule = require('node-schedule');
const exec = require('exec');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;

//set some logs settings
var logger = createLogger({
	format: combine(		
		format.timestamp(),
		format.simple(),
		format.colorize({ all: true })

	),
	transports: [
		new transports.Console(),
		new transports.File({ filename: 'combined.log' })
	]
});



const default_slide_time = 60;
var TARGET = {
  URL : {value: 1, name: "url"}, 
  VIDEO: {value: 2, name: "video"}, 
  IMG : {value: 3, name: "image"},
  REPO : {value: 4, name: "repository"}
}

var SLIDE_STATUS = {
	STOPPED: {value: 1, name: "stopped"},
	STARTED: {value: 2, name: "started"}
}

var slideJob;
var sleepJob;
var wakeUpJob;
var currentIndex = 0;
var loadedPage;
var slide_show_status = SLIDE_STATUS.STOPPED.value;
var db = new loki('dashboard.db', {
	autoload: true,
	autoloadCallback : databaseInitialize,
	autosave: true, 
	autosaveInterval: 4000
});

function initJobs(){ 
  if (slideJob != null)
    slideJob.cancel();
  if (wakeUpJob != null)
    wakeUpJob.cancel();
  if (sleepJob != null)
    sleepJob.cancel();

  var slideTime = getSlideTime();
  var sleepTime = getSleepTime();
  var wakeUpTime = getWakeUpTime();  
  logger.log('debug', 'Sliding next URL!');
  nextSlide();
  if ( sleepTime.length>0){   
   logger.log('debug', 'Sleep time pattern', {
		pattern: sleepTime[0].pattern
	});
   sleepJob = schedule.scheduleJob(sleepTime[0].pattern, function(){
     logger.log('info', 'Goint to sleep');
     sleep();
   });
  }
  if ( wakeUpTime.length>0){
    logger.log('debug', 'WakeUp time pattern', {
		pattern: wakeUpTime[0].pattern
	});
	wakeUpJob = schedule.scheduleJob(wakeUpTime[0].pattern, function(){
     logger.log('info','Waking up!');
     wakeUp();
	});
  }

}
// implement the autoloadback referenced in loki constructor
function databaseInitialize() {
  var urls = db.getCollection("urls",{ indices: ['id'] });
  if (urls === null) {
    urls = db.addCollection("urls");
  }
  // kick off any program logic or start listening to external events
  runProgramLogic();
}

// example method with any bootstrap logic to run after database initialized
function runProgramLogic() {
  var urlCount = db.getCollection("urls").count();
  logger.log('debug', 'Number of urls in database', {
		count: urlCount
	});
  var times = db.getCollection("times");
  if ( times != null){
    times.data.forEach(function(t){
      logger.log('debug', 'Cron', {
		type: t.type,
		pattern: t.pattern
	  });

    });
  }
  initJobs();
}

function getUrls(){
  var urls = db.getCollection("urls");
  if (urls === null) {
    urls = db.addCollection("urls");
  }
  return urls;
}

function getTimes(){
  var times = db.getCollection("times");
  if (times == null) {
    times = db.addCollection("times");
  }
  return times.data;
}

function getSlideTime(){
  var times = db.getCollection("times");
  if (times == null ){
    db.addCollection("times");
    return null;
  }
  return times.find( {'type':'slide'});
}

function addSlide(slide){
	var urls = db.getCollection("urls");
  if ( urls == null ){
    urls = db.addCollection("urls");
  }
  if ( slide == null){
    return;
  }
  var existing = urls.chain().find( {'id': slide.id});
  if (existing != null){
    existing.remove();
  }
  urls.insert(slide);
}

function setSlideTime( timePattern){  
  var times = db.getCollection("times");
  if ( times == null ){
    times = db.addCollection("times");
  }
  if ( timePattern == null){
    return;
  }
  var existing = times.chain().find( {'type':'slide'});
  if (existing != null){
    existing.remove();
  }
  times.insert(  {'type':'slide', 'pattern':timePattern});
}


function getWakeUpTime(){
  var times = db.getCollection("times");
  if (times == null ){
    db.addCollection("times");
    return null;
  } 
  return times.find( {'type':'wakeup'});
}

function setWakeUpTime( timePattern){  
  var times = db.getCollection("times");
  if ( times == null ){
    times = db.addCollection("times");
  }
  if ( timePattern == null){
    return;
  }
  var existing = times.chain().find( {'type':'wakeup'});
  if (existing != null){
    existing.remove();
  }
  times.insert(  {'type':'wakeup', 'pattern':timePattern});
}

function setSleepTime( timePattern){  
  var times = db.getCollection("times");
  if (times == null ){
    times = db.addCollection("times");
  }
  if ( timePattern == null ) {
    return;
  }
  var existing = times.chain().find( {'type':'sleep'});
  if (existing != null){
    existing.remove();
  }
  times.insert(  {'type':'sleep', 'pattern':timePattern});
}

function deleteUrl( id){
  logger.log('debug', 'Deleting URL', {
		urlId: id
	});
  var urls = db.getCollection("urls");
  if (urls == null ){
    urls = db.addCollection("urls");
  }
  if ( id == null ) {
    return;
  }
  var existing = urls.chain().find( {'id':id});
  if (existing != null){
    existing.remove();
  }
}


function getSleepTime(){
  var times = db.getCollection("times");
  if (times == null ){
    db.addCollection("times");
    return null;
  }
  return times.find( {'type':'sleep'});
}

function sleep(){
  child = exec('echo "standby 0" | cec-client -s',
   function (error, stdout, stderr) {
	 logger.log('info', 'Turned off TV successfully');
     if (error !== null) {
       logger.log('error','exec error', {
		   errorMsg: error
	   });
     }
   });

}

function displayHome(){
	loadedPage = {
         id : "home",
		 status: "unknown"
    }
	mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))
}

function nextSlide(){
  if (slideJob){
	  slideJob.cancel();
  }
  slide_show_status = SLIDE_STATUS.STARTED.value;
  var urls  = getUrls();  
  var count = urls.count();  
  if ( currentIndex < count-1){
   currentIndex++;
  }else{
   currentIndex = 0;
  }
  if ( currentIndex === 0 && count === 0){
	slide_show_status = SLIDE_STATUS.STOPPED.value;
	displayHome();
    return;
  }
  //check if last loadedPage is the same (case when only one slide) and if it failed, try next
  if (loadedPage && (loadedPage.id === urls.data[currentIndex].id) && loadedPage.result === "failed"){
	  logger.log("info","ici",{
		  page: loadedPage.id,
		  res: loadedPage.result
	  });
	  if (urls.data.length === 1){
		  logger.log('info', 'Displaying home');
		  displayHome();
		  return;
	  }
	  nextSlide();
	  return;
  }
  logger.log('info', 'Displaying URL', {
	id: urls.data[currentIndex].id,
	url: urls.data[currentIndex].url,
	duration: urls.data[currentIndex].duration,
	authentication: urls.data[currentIndex].authentication
  });
    
  loadedPage = {
         id : urls.data[currentIndex].id,
         duration: urls.data[currentIndex].duration,
		 status: "unknown"
  }
  if (slide_show_status === SLIDE_STATUS.STARTED.value){
	if (urls.data[currentIndex].authentication){
		mainWindow.loadURL(urls.data[currentIndex].url, {extraHeaders: 'Authorization: Basic anRhaWxsYTpwYXNzd29yZDI=\n'});
	}else{
		mainWindow.loadURL(urls.data[currentIndex].url);
	}
  }
}

function wakeUp(){
  child = exec('echo "on 0" | cec-client -s',
  function (error, stdout, stderr) {    
	logger.log('info', 'Turned on TV Successfully');
    if (error !== null) {
      logger.log('error','exec error', {
		   errorMsg: error
	   });
    }
  });
}

// Module to control application life.
const app = electron.app

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow

// configure app to use bodyParser()
// this will let us get the data from a POST
appExpress.use(bodyParser.urlencoded({ extended: true }));
appExpress.use(bodyParser.json());



var port = process.env.PORT || 1338;  

// Authentication module.

var basic = auth.basic({
    realm: "Dashboard Area.",
    file: __dirname + "/users.htpasswd"
});

basic.on('success', (result, req) => {    
	logger.log('info','User authenticated', {
		   user: result.user
	   });
});


 
basic.on('fail', (result, req) => {
	logger.log('error','User authentication failed', {
		   user: result.user
	   });
});
 
basic.on('error', (error, req) => {
    logger.log('error','User authentication error', {
		   errorMsg: error
	});
});

appExpress.use(auth.connect(basic));

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({kiosk: true, webPreferences:{ nodeIntegration: false}})
  mainWindow.setMenu(null);
  // and load the index.html of the app.
  displayHome();
  contents = mainWindow.webContents;
  contents.on('did-fail-load', (event,errorCode) => {
	logger.log("error","finish-failed",{
		id: loadedPage.id,
		err: errorCode
	});
	if(errorCode === -3){
		if (!loadedPage.duration)
			loadedPage.duration = default_slide_time;
		loadedPage.result = 'success';
		slideJob = schedule.scheduleJob(new Date(Date.now()+ (loadedPage.duration * 1000)), function(){
			logger.log('info','Jumping to next slide');
			nextSlide();
		});
	}else{
		notifier.notify('Dashboard Infos', {
			message: "Cannot load page: "+ loadedPage.id,
			duration: 30
		});
		loadedPage.result="failed";
		logger.log('error', 'Displaying slide',{
			id: loadedPage.id
		});
		nextSlide();
	}
  });
  contents.on('login', (event, webContents, request, authInfo, callback) => {
  event.preventDefault();
  logger.log('info','Authentication required', {
		   page: loadedPage.id
	});
  callback('username', 'secret')
})
  contents.on('did-finish-load', () => {
	  logger.log("info","finish-load",{
		id: loadedPage.id
	  });
	if ( slide_show_status === SLIDE_STATUS.STOPPED.value){
		return;
	}
   if (!loadedPage.duration)
		loadedPage.duration = default_slide_time;
   if (loadedPage.result !== 'success'){
   loadedPage.result = 'success';
   slideJob = schedule.scheduleJob(new Date(Date.now()+ (loadedPage.duration * 1000)), function(){
     logger.log('info','Jumping to next slide');
     nextSlide();
   });
   }
  });

 // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  });

  //Display for 1 minute the Dashboard IP
  notifier.notify('Wallboard Infos', { 
    message: 'IP'+ip.address(),
    duration: 30
  });


}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();              // get an instance of the express Router

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
router.post('/display', function(req, res) {
	if ( req.body.duration){
		if (req.body.duration < default_slide_time){
			req.body.duration = default_slide_time;
		}
	}else{
		req.body.duration = default_slide_time;
	}
	if ( req.body.authentication)
	
    
    addSlide({id: req.body.id, url: req.body.url, duration: req.body.duration, authentication: req.body.authentication});
	nextSlide();
	res.json({ message: 'Displaying '+ req.body.url +' ('+req.body.id+') for '+req.body.duration+' seconds'});  		    
});

router.delete('/url', function(req, res) {
    res.json({ message: 'Deleting '+ req.body.id});    
    deleteUrl(req.body.id);
	initJobs();
});


router.post('/display/sleep', function(req, res) {
   sleep();  
   res.json({ 'message': 'Going to sleep'});   
   
});

router.post('/display/wakeup', function(req, res) {
  wakeUp();
  res.json({ 'message': 'Woke up'});    
});

router.get('/info', function(req, res) {
  notifier.notify('Notification Title', {
    message: 'IP'+ip.address(),
    duration: 5
  });
  res.json({'IP': ip.address(), "Urls": getUrls().data, "Times": getTimes()});
});

router.get('/times', function(req, res) {
   res.json(getTimes());
});

router.post('/wakeup',  function(req, res) {
    try{
      var interval = parser.parseExpression(req.body.time);
      setWakeUpTime(req.body.time);
      initJobs();
      res.json({'next': interval.next().toString()});
    } catch (err) {
      res.json({'Error': err.message});
    }
});

router.post('/sleep',  function(req, res) {
    try{
      var interval = parser.parseExpression(req.body.time);
      setSleepTime(req.body.time);
      initJobs();
      res.json({'next': interval.next().toString()});
    } catch (err) {
      res.json({'Error': err.message});
    }
});


router.post('/slide',  function(req, res) {
    try{
      var interval = parser.parseExpression(req.body.time);
      setSlideTime(req.body.time);
      initJobs();
      res.json({'next': interval.next().toString()});
    } catch (err) {
      res.json({'Error': err.message});
    }
});

router.post('/exit',function(req, res) {
    process.exit();
});

appExpress.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
appExpress.use('/dashboard', router);

//START THE SERVER
// =============================================================================
appExpress.listen(port);
	logger.log('info','Dashboard started', {
		   dashboardPort: port
	});

