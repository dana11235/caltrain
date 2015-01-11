var Popup = {
  updateStations: function() {
    var selectedDirection = $("#direction").val();
    CaltrainCountdown.openDb(function(db) {
      CaltrainCountdown.getStationsForDirection(db, selectedDirection, Popup.setStations) 
    });
  },

  setStations: function(stations) {
    var stationsText = stations.map(function(station) {
      var name = station.name.replace(" Caltrain", ""); 
      return "<option value='" + station.caltrain_id + "'>" + name + "</option>";
    }).join('');
    $("#stations").html(stationsText);
    CaltrainCountdown.openDb(function(db) {
      CaltrainCountdown.getNextCaltrainTime(db, $("#stations").val());
    });
  } 
}

$(document).ready(function(){
  Popup.updateStations();
  $("#direction").on('change', Popup.updateStations);
});
