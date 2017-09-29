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

var slideJob;
var sleepJob;
var wakeUpJob;
var currentIndex = 0;
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
  if ( slideTime.length>0){
   console.log("Slide time pattern "+slideTime[0].pattern);
   slideJob = schedule.scheduleJob(slideTime[0].pattern, function(){
     console.log('Sliding next URL!');
     nextSlide();
   });
  }
  if ( sleepTime.length>0){
   console.log("Sleep time pattern "+sleepTime[0].pattern);
   sleepJob = schedule.scheduleJob(sleepTime[0].pattern, function(){
     console.log('Go Sleeping!');
     sleep();
   });
  }
  if ( wakeUpTime.length>0){
   console.log("WakeUp time pattern "+wakeUpTime[0].pattern);
   wakeUpJob = schedule.scheduleJob(wakeUpTime[0].pattern, function(){
     console.log('Waking up!');
     wakeUp();
   });
  }

}
// implement the autoloadback referenced in loki constructor
function databaseInitialize() {
  var urls = db.getCollection("urls");
  if (urls === null) {
    urls = db.addCollection("urls");
  }
  // kick off any program logic or start listening to external events
  runProgramLogic();
}

// example method with any bootstrap logic to run after database initialized
function runProgramLogic() {
  var urlCount = db.getCollection("urls").count();
  console.log("number of urls in database : " + urlCount);
  var times = db.getCollection("times");
  if ( times != null){
    times.data.forEach(function(t){
      console.log(t.type+":"+t.pattern);
    });
    initJobs();
  }
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

function setSlideTime( timePattern){
  console.log(timePattern);
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
  console.log(timePattern);
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
  console.log(timePattern);
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
  console.log("Deleting: "+id);
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
     console.log("Turned off TV successfully");
     if (error !== null) {
       console.log('exec error: ' + error);
     }
   });

}

function nextSlide(){
  var urls  = getUrls();
  console.log(urls.data);
  var count = urls.count();
  console.log(count);
  console.log(currentIndex);
  if ( currentIndex < count-1){
   currentIndex++;
  }else{
   currentIndex = 0;
  }
  if ( currentIndex == 0 && count == 0){
    return
  }
  console.log("Displaying "+urls.data[currentIndex].id+" ("+urls.data[currentIndex].url+")");
  mainWindow.loadURL(urls.data[currentIndex].url);
}

function wakeUp(){
  child = exec('echo "on 0" | cec-client -s',
  function (error, stdout, stderr) {
    console.log("Turned on TV successfully");
    if (error !== null) {
      console.log('exec error: ' + error);
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
    console.log(`User authenticated: ${result.user}`);
});
 
basic.on('fail', (result, req) => {
    console.log(`User authentication failed: ${result.user}`);
});
 
basic.on('error', (error, req) => {
    console.log(`Authentication error: ${error.code + " - " + error.message}`);
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
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))
  contents = mainWindow.webContents
  contents.on('did-fail-load', (event) => {
	  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'error.html'),
    protocol: 'file:',
    slashes: true
  }))
  })

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })

  //Display for 1 minute the Dashboard IP
  notifier.notify('Dashboard Infos', { 
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
    res.json({ message: 'Displaying '+ req.body.url +' ('+req.body.id+')'});  		
    //mainWindow.loadURL(req.body.url);
    getUrls().insert({id: req.body.id, url: req.body.url});
});

router.delete('/url', function(req, res) {
    res.json({ message: 'Deleting '+ req.body.id});
    //mainWindow.loadURL(req.body.url);
    deleteUrl(req.body.id);
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


// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
appExpress.use('/dashboard', router);

//START THE SERVER
// =============================================================================
appExpress.listen(port);
console.log('Dashboard accessible on port ' + port);
