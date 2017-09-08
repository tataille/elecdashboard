const electron = require('electron')
// call the packages we need
const express    = require('express');
const appExpress = express();                 // define our app using express
const bodyParser = require('body-parser');
const auth = require('http-auth');
// Module to control application life.
const app = electron.app
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow

const path = require('path')
const url = require('url')

// configure app to use bodyParser()
// this will let us get the data from a POST
appExpress.use(bodyParser.urlencoded({ extended: true }));
appExpress.use(bodyParser.json());

var port = process.env.PORT || 1338;  

// Authentication module.

var basic = auth.basic({
    realm: "Dashboard Area.",
    file: __dirname + "/users.htpasswd" // gevorg:gpass, Sarah:testpass ...
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
  //mainWindow.setMenu(null);
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

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
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
    res.json({ message: 'Displaying '+ req.body.url +' '+req.body.extraHeaders});  	
	
		mainWindow.loadURL(req.body.url)
});

router.post('/display/sleep', function(req, res) {
      res.json({ message: 'Going to sleep'});   
});

router.post('/display/wakeup', function(req, res) {
      res.json({ message: 'Woke up'});    
});


// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
appExpress.use('/dashboard', router);

// START THE SERVER
// =============================================================================
appExpress.listen(port);
console.log('Magic happens on port ' + port);

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
