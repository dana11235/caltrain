var Popup = {
  updateDirection: function() {
    var direction = _directionEl.val();
    console.log('setting direction: ' + direction);
    chrome.storage.local.set({'direction': direction});
    Popup.updateStations(direction);
    chrome.storage.local.get(direction, function(response) {
      if (response[direction]) {
        _stationsEl.val(response[direction]);
      } else {
        // Hack if station isn't set yet
        if (direction == "NB") {
          _stationsEl.val(70011);
        } else {
          _stationsEl.val(70012);
        }
      }
    });

    CaltrainCountdown.openDb(function(db) {
      CaltrainCountdown.getNextCaltrainTime(db);
    });
  },

  updateStations: function(selectedDirection) {
    CaltrainCountdown.openDb(function(db) {
      CaltrainCountdown.getStationsForDirection(db, selectedDirection, Popup.setStations) 
    });
  },

  setStations: function(stations) {
    var stationsText = stations.map(function(station) {
      var name = station.name.replace(" Caltrain", ""); 
      return "<option value='" + station.caltrain_id + "'>" + name + "</option>";
    }).join('');
    _stationsEl.html(stationsText);
    CaltrainCountdown.openDb(function(db) {
      CaltrainCountdown.getNextCaltrainTime(db);
    });
  },

  storeStation: function() {
    var station = _stationsEl.val();
    var direction = _directionEl.val();
    var data = {};
    data[direction] = station;
    console.log('setting station: ' + station);
    chrome.storage.local.set(data);

    CaltrainCountdown.openDb(function(db) {
      CaltrainCountdown.getNextCaltrainTime(db);
    });
  } 
}

$(document).ready(function(){
  window._directionEl = $("#direction");
  window._stationsEl = $("#stations");
  chrome.storage.local.get('direction', function(response){
    var direction = response.direction || "SB";
    Popup.updateStations(direction);
    console.log('direction from storage: ' + direction);
    _directionEl.val(direction);
    chrome.storage.local.get(direction, function(response) {
      console.log('station from storage');
      console.log(response);
      _stationsEl.val(response[direction]);
    });
  });;
  _directionEl.on('change', Popup.updateDirection);
  _stationsEl.on('change', Popup.storeStation);
});
