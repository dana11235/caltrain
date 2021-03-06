chrome.runtime.onStartup.addListener(function(){
  CaltrainCountdown.setupExtension();
});

chrome.runtime.onInstalled.addListener(function(){
  CaltrainCountdown.loadDatabase();
  CaltrainCountdown.setupExtension();
});

chrome.alarms.onAlarm.addListener(function(alarm) {
  CaltrainCountdown.openDb(function(db) {
    CaltrainCountdown.getNextCaltrainTime(db);
  });
});

var calculateDifference = function(current, next) {
  hoursDifference = Math.trunc(next / 100) - Math.trunc(current / 100);
  minutesDifference = next % 100 - current % 100;
  return 60 * hoursDifference + minutesDifference;
}

var CaltrainCountdown = {
  openDb: function(callback) {
    var version = 7;
    var request = indexedDB.open("stops", version);

    request.onsuccess = function(e) {
      callback(e.target.result);
    };

    request.onupgradeneeded = function(event) { 
      var db = event.target.result;
      // Create an objectStore for this database
      try {
        db.deleteObjectStore('stops');
      } catch (err) {
        console.log(err);
      }
      var store = db.createObjectStore('stops', { keyPath: "id", autoIncrement: true });
      store.createIndex('platform_code_index', ['platform_code'], {unique:false});

      // Create an objectStore for this database
      try {
        db.deleteObjectStore('stop_times');
      } catch (err) {
        console.log(err);
      }
      store = db.createObjectStore('stop_times', { keyPath: "id", autoIncrement: true });
      store.createIndex('stop_id_index', ['stop_id'], {unique:false});
      store.createIndex('day_stop_id_index', ['day', 'stop_id', 'departure_time'], {unique:false});
    };
  },

  loadDatabase: function() {
    CaltrainCountdown.loadLocalFile('stops.txt', CaltrainCountdown.loadStops);
    CaltrainCountdown.loadLocalFile('stop_times.txt', CaltrainCountdown.loadStopTimes);
  },

  loadLocalFile: function(filename, callback) {
    var request = new XMLHttpRequest();
    request.onreadystatechange = function() {
      if(request.readyState == XMLHttpRequest.DONE && request.status == 200) {
        callback(request.responseText);
      }
    };
    url = chrome.extension.getURL(filename);
    request.open('GET', url, true);
    request.send(null);
  },

  loadStops: function(stopsFile) {
    var stops = stopsFile.split('\n');
    CaltrainCountdown.openDb(function(db){ CaltrainCountdown.loadStopData(db, stops);});
  },

  loadStopData: function(db, stops) {
    var trans = db.transaction(["stops"], "readwrite");
    var store = trans.objectStore("stops");
    store.clear();
    stops.forEach(function(stop) {
      if (stop.length > 0) {
        fields = stop.split(',')
        var request = store.put({
          "caltrain_id": parseInt(fields[0]),
          "name": fields[2].replace(/"/g,''),
          "lat": parseFloat(fields[3]),
          "lon": parseFloat(fields[4]),
          "zone": parseInt(fields[5]),
          "platform_code": fields[9]
        });
      }
    });
  },

  loadStopTimes: function(stopsFile) {
    var stops = stopsFile.split('\n');
    CaltrainCountdown.openDb(function(db){ CaltrainCountdown.loadStopTimeData(db, stops);});
  },

  loadStopTimeData: function(db, stops) {
    var trans = db.transaction(["stop_times"], "readwrite");
    var store = trans.objectStore("stop_times");
    store.clear();
    stops.forEach(function(stop) {
      if (stop.length > 0) {
        fields = stop.split(',');

        time_parts = fields[2].match(/(\d+)(?::(\d\d))?\s*(p?)/);
        departure_time = parseInt("" + time_parts[1] + time_parts[2]);
        var request = store.put({
          "trip_id": fields[0],
          "day": /a$/.test(fields[0]) ? 'Saturday' : (/u$/.test(fields[0]) ? 'Sunday' : 'Weekday'),
          "departure_time": departure_time,
          "stop_id": parseInt(fields[3])
        });
      }
    });
  },

  setupExtension: function(receiver) {
    chrome.browserAction.setBadgeBackgroundColor({color: [0,0,0,128]});
    chrome.browserAction.setPopup({popup: "popup.html"});
    chrome.alarms.create(chrome.runtime.getManifest().name, 
      {when: Date.now(), periodInMinutes: 1}
    );
  },

  getStationsForDirection: function(db, direction, callback) {
    var trans = db.transaction(["stops"]);
    var store = trans.objectStore("stops");
    var index = store.index('platform_code_index');
    var request = index.openCursor(IDBKeyRange.only([direction]));

    results = []
    request.onsuccess = function(e) {
      var result = e.target.result;
      if (result) {
        results.push(result.value);
        result.continue();
      } else {
        callback(results);
      }
    };
  },

  getNextCaltrainTime: function(db) {
    var date = new Date();
    var minutes = date.getMinutes();
    // Pad minutes less than 10
    if (minutes < 10) {
      minutes = "0" + minutes;
    }
    var hhmm = parseInt("" + date.getHours() + minutes);
    var dayStr = "Weekday"

    var day = date.getDay();
    if (day == 0) {
      dayStr = "Sunday";
    } else if (day == 6) {
      dayStr = "Saturday";
    }

    chrome.storage.local.get('direction', function(response) {
      var direction = response.direction || "SB";
      var directionText = direction == "NB" ? "N" : "S";

      chrome.storage.local.get(direction, function(response) {
        var station = response[direction];
        // This is a hack. Should be pulled dynamically
        if (!station) {
          if (direction == "NB") {
            station = 70011;
          } else {
            station = 70012;
          }
        }

        var trans = db.transaction(["stop_times"]);
        var store = trans.objectStore("stop_times");
        var index = store.index('day_stop_id_index');

        var lowerBound = [dayStr, parseInt(station), hhmm];
        var upperBound = [dayStr, parseInt(station), 2359];
        var range = IDBKeyRange.bound(lowerBound,upperBound);
        var request = index.get(range);
        request.onsuccess = function(e) {
          var timeToNext = "-";
          if (e.target.result) {
            console.log(e.target.result);
            timeToNext = calculateDifference(hhmm, e.target.result.departure_time);
            // Notifications for > 120 minutes are probably for tomorrow
            if (timeToNext > 120) {
              timeToNext = "-";
            }
          }
          CaltrainCountdown.setBadge(timeToNext + directionText);
        }
      })
    })
  },

  setBadge: function(text) {
    chrome.browserAction.setBadgeText({text: text});
  }
}
