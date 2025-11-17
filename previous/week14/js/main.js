//import west from './data/generators_west.json' with { type: 'json' };
//import north from './data/generators_north.json' assert { type: 'json' };
//import south from './data/generators_south.json' assert { type: 'json' };

let westRequest = new Request("./data/generators-west.json");
let northRequest = new Request("./data/generators-north.json");
let southRequest = new Request("./data/generators-south.json");

fetch(westRequest)
    .then(function(resp) {
        return resp.json();
    })
    .then(function(westData) {
        for (n in westData) {
        console.log(westData[n].station, westData[n].region); }
    });

fetch(northRequest)
    .then(function(resp) {
        return resp.json();
    })
    .then(function(northData) {
        for (n in northData) {
        console.log(northData[n].station, northData[n].region); }
    });

fetch(southRequest)
    .then(function(resp) {
        return resp.json();
    })
    .then(function(southData) {
        for (n in southData) {
        console.log(southData[n].station, southData[n].region); }
    });