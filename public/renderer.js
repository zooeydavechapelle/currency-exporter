var app = require('electron');
var remote = app.remote;
var dialog = remote.dialog;
var BrowserWindow = remote.BrowserWindow;
var fs = require('fs');
var _ = require('lodash');
var json2csv = require('json2csv');
var SQL = require('sql.js');
var socket;
var revloWindow = null;
var https = require('https');
var async = require("async");
var session = remote.session;

var deepbotConnectButton = document.querySelector('.deepbotConnect');
deepbotConnectButton.addEventListener('click', () => {
  deepbotConnect();
});

var logIntoRevlo = document.getElementById('logIntoRevlo');
logIntoRevlo.addEventListener('click', () => {
  console.log('ckick');
  createRevloWindow();
});

var selectAnkhBotFile = document.getElementById('selectAnkhBotFile');

selectAnkhBotFile.addEventListener('click', () => {
  console.log(remote.app.getPath('appData'));
  dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'SQLIte Database', extensions: ['sqlite'] },
    ],
    defaultPath: remote.app.getPath('appData') + "\\AnkhHeart\\AnkhBotR2\\Twitch\\Databases"
  }, files => {
    console.log(files);
    loadAnkhBotDatabase(files);
  });
});


function handleCallback(url) {
  console.log(url);
  var authed = /\/\/(www.)?revlo.co(.+)dashboard/gi.exec(url) || null;
  if (authed) {
    revloWindow.destroy();
    fetchRevloProgramID();
  }
}

function fetchRevloProgramID() {
  console.log('start revlo fetch');
  var options = {
    host: 'www.revlo.co',
    port: 443,
    path: '/' + document.getElementsByName("revloUsername")[0].value
  };

  https.get(options, function(res) {
    var body = '';
    res.on('data', function(chunk) {
      body += chunk;
    });
    res.on('end', function() {
      console.log(body);
      var program_id = /REVLO_PROGRAM_ID = (\d+)/gi.exec(body);
      console.log('program_id', program_id[1]);
      startRevloFetch(program_id[1]);
    });
  }).on('error', function(e) {
    console.log("Got error: " + e.message);
  });
}

function startRevloFetch(program_id) {
  session.defaultSession.cookies.get({url: 'https://www.revlo.co'}, (error, cookies) => {
    console.log(error, cookies);
  });
  var endpoints = [];
  https://www.revlo.co/api/loyalties/all_time/200?program_id=114457
  var options = {
    host: 'www.revlo.co',
    port: 443,
    path: '/api/loyalties/all_time/1?program_id=' + program_id
  };

  https.get(options, function(res) {
    var body = '';
    res.on('data', function(chunk) {
      body += chunk;
    });
    res.on('end', function() {
      var json = JSON.parse(body);
      console.log(json);
      var total_loyalties = json.total_loyalties;
      var pages = Math.ceil(total_loyalties / 50);

      for (i = 0; i < pages; i++) {
        endpoints.push({ port: 443, host: 'www.revlo.co', path: '/api/loyalties/all_time/' + (i + 1) + '?program_id=' + program_id });
      }

      console.log(endpoints);

      async.mapSeries(endpoints, https.get, function(results) {
        // Array of results
        console.log(results);
      }).then(() => {
        console.log('after');
      });

    });
  }).on('error', function(e) {
    console.log("Got error: " + e.message);
  });

}

function createRevloWindow() {
  console.log(revloWindow);
  if (revloWindow === null) {
    console.log('browser window null');
    revloWindow = new BrowserWindow({width: 800, height: 600, webPreferences: {
        nodeIntegration: false
      }
    });
    revloWindow.loadURL(`https://www.revlo.co/users/sign_in?broadcaster=true`);
    revloWindow.on('closed', function () {
      revloWindow = null;
    })

    revloWindow.webContents.on('will-navigate', function (event, url) {
      handleCallback(url);
    });

    revloWindow.webContents.on('did-get-redirect-request', function (event, oldUrl, newUrl) {
      handleCallback(newUrl);
    });
  }
}

function loadAnkhBotDatabase(path) {
  console.log(path);
  var filebuffer = fs.readFileSync(path[0]);
  var db = new SQL.Database(filebuffer);

  var data = [];
  var querydata = db.exec('SELECT Name as user, Points as points FROM CurrencyUser');

  querydata[0].values.forEach((row) => {
    data.push({user: row[0], points: row[1]});
  });
  console.log(data);
  // db.serialize(function() {
  //   db.each("SELECT Name as user, Points as points FROM CurrencyUser", function(err, row) {
  //     data.push({user: row.user, points: row.points});
  //   });
  // });
  db.close();
  saveFile(data);
}

function deepbotConnect() {
  initSocket();
}

function initSocket() {
  console.log('opening socket')
  socket = new WebSocket("ws://localhost:3337");

  socket.onmessage = function (event) {
    console.log(event.data);
    var data = JSON.parse(event.data);
    switch (data.function) {
      case 'register':
        handleRegister(data);
        break;
      case 'get_users_count':
        handleGetUsersCount(data);
        break;
      case 'get_users':
        handleGetUsers(data);
        break;
    }
  }

  socket.onopen = function (data) {
    console.log('socket open')
    var apiKey = document.getElementsByName("deepbotApiKey")[0].value;
    console.log(apiKey);
    socket.send("api|register|" + apiKey);
  };
}

function handleRegister(data) {
  getUsersCount();
}

function handleGetUsers(data) {
  var data = _.map(data.msg, _.partialRight(_.pick, "user", "points"));
  saveFile(data);
}

function getUsersCount() {
  socket.send("api|get_users_count");
}

function handleGetUsersCount(data) {
  console.log("users", data.msg);
  getUsers(data.msg);
}

function getUsers(limit) {
  socket.send("api|get_users|0|" + limit);
}

function saveFile(data) {
  var fields = ['user', 'points'];

  var csv = json2csv({ data: data });

  dialog.showSaveDialog({
    defaultPath: remote.app.getPath('documents') + '\\points.csv'
  }, function (fileName) {
    if (fileName === undefined) {
      console.log("You didn't save the file");
      return;
    }
    // fileName is a string that contains the path and filename created in the save file dialog.
    fs.writeFile(fileName, csv, function (err) {
      if (err) {
        alert("An error ocurred creating the file "+ err.message)
      }

      alert("The file has been succesfully saved");
    });
  });
}
