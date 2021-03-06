(function () {
    let sensorStatChart = {};
    let map = {};
    let sensorReadings = [];
    let currentDate = new Date();
    const animationSymbols = {PLAY: "play", PAUSE: "pause"};
    let animationIsRunning = false;
    let animationInterval = {};
    let currentHour = 12;
    let sensorMappings = {};
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 1);
    maxDate.setHours(0,0,0,0);
    const minDate = new Date("06/01/2009");

    const populationDict = {
        13:{
            name: "Carlton",
            total: 18535,
            density: 10300
        },
        14:{
            name: "Parkville",
            total: 7409,
            density: 1850
        },
        35:{
            name: "North Melbourne",
            total: 11755,
            density: 4900
        },
        78:{
            name: "West Melbourne",
            total: 5515,
            density: 862
        },
        15:{
            name: "Melbourne (3000)",
            total: 23642,
            density: 7630
        },
        122:{
            name: "Melbourne (3004)",
            total: 23642,
            density: 7630
        },
        48:{
            name: "Southbank",
            total: 11235,
            density: 6610
        },
        59:{
            name: "South Wharf",
            total: 66,
            density: 264
        },
        64:{
            name: "Docklands",
            total: 10964,
            density: 3700
        },
        29:{
            name: "East Melbourne",
            total: 4964,
            density: 2610
        }
    };

    const totalPopulationCount = 117728;
    let selectedSensor = {};
    let oldSuburb = "";
    let totalObservationsPerHour = [];

    //Load in GeoJSON data
    const sensorLocationsURL = "http://www.pedestrian.melbourne.vic.gov.au/data/sensors.csv";
    const proxyURL = "https://mps-proxy.herokuapp.com/";
    const sensorDataURL = "https://compedv2api.herokuapp.com/api/bydate/";

    const mapColor = "white";
    const keyCodes = {"space":32};

    d3.queue()
        .defer(d3.json, "data/melbourne.geojson")
        .defer(d3.csv, "data/sensor_locations_fallback.csv", rowConverter)
        .defer(d3.json, proxyURL + sensorDataURL + formatDate(currentDate))
        .defer(d3.json, "data/sensorMappings.json")
        .await(function(error, cityOutlines, sensorLocations, sensorReadingsByDay, sensorDict) {
            if(error){
                const status = +error.currentTarget.status;
                switch(status){
                    case 429:
                        alert("The server as reached the request limit. The limit will reset after 3 minutes");
                        break;
                    default:
                        alert("error: " + status);
                }
            }else{
                sensorReadings = sensorReadingsByDay.thedata[0].sensors;
                totalObservationsPerHour = calcHourlyTotal(sensorReadings);
                sensorMappings = sensorDict;
                // init map
                map = new suburbMap("#mapContainer", 1, cityOutlines, sensorLocations, sensorMappings, populationDict, tileColor = mapColor);
                // init line chart
                sensorStatChart = new lineChart("#lineChartContainer", 0.75);

                // set center sensor as default selection
                onSensorSelect(sensorLocations[30]);

                // add net sensor event listener
                d3.select("body")
                    .on("keydown", () =>{
                        const code = d3.event.keyCode;
                        if(code === keyCodes.space){
                            const currentIndex = sensorLocations.indexOf(selectedSensor);
                            onSensorSelect(sensorLocations[nextSensor(currentIndex, sensorLocations)]);
                        }
                    });

                d3.select("#mapToggle").property("checked", false);

                d3.select("#hourInput")
                    .property("value", currentHour)
                    .on("input", onHourInputChange);

                d3.select("#hourInput")
                    .property("value", currentHour)
                    .on("click",() =>{
                        if(animationIsRunning){
                            onAnimationClick();
                        }
                    });

                updateAllUIElements(currentDate, currentHour, selectedSensor, sensorReadings, sensorMappings, totalObservationsPerHour);

                d3.select("#backBtn").on("click", onBackBtnClick);
                d3.select("#nextBtn").on("click", onNextBtnClick);

                d3.select("#animationBtn").on("click", onAnimationClick);

                const lineLegends = ["counts", "ave", "ave52"];
                lineLegends.forEach(name => {
                    const selector = "#" + name + "Legend";
                    const lineClass = ".line." +name;
                    d3.select(selector).on("mouseenter", d => {
                        d3.selectAll(".line.counts").classed("selected", false);
                        d3.selectAll(lineClass).classed("selected", true)
                    });
                    d3.select(selector).on("mouseleave", d => {
                        d3.selectAll(lineClass).classed("selected", false);
                        d3.selectAll(".line.counts").classed("selected", true);
                    });
                });

                d3.select("#mapToggle").on("change", onMapToggle);

                // remove loading overlay after everything is initialized
                d3.select("body").classed("overflow-hidden", false).select("#page-overlay").remove();
            }
        });

    function nextSensor(current, list){
        return current === list.length - 1 ? 0 : current + 1;
    }

    function rowConverter(d) {
        return {
            longitude: +d["Longitude"],
            latitude: +d["Latitude"],
            id: +d["MCCID_INT"],
            name: d["MCCID_STR"],
            description: d["FEATURENAM"],
            yearInstalled: d["startDate"],
        };
    }

    function onMapToggle() {
        const isChecked = d3.select(this).property("checked");
        const value = isChecked === true ? "multi" : "none";
        map.updateBackgroundColor(value);
    }

    function updateSensorDetails(sensor, readings, currentHour) {
        const errorText = "N/A";
        d3.select("#sensorDescription").text(sensor.description);
        d3.select("#sensorId").text(sensor.id);
        d3.select("#sensorName").text(sensor.name);
        d3.select("#sensorYearInstalled").text((sensor.yearInstalled).replace(/-/g, '/'));
        if(readings){
            d3.select("#statusLight").classed("online", +readings.counts[currentHour] >= 0);
            d3.select("#countCurrentHour").text(+readings.counts[currentHour] >= 0 ? readings.counts[currentHour] : errorText);
            d3.select("#count").text(+readings.counts[currentHour] >= 0 ? readings.counts[currentHour] : errorText);
            d3.select("#ave").text(+readings.ave[currentHour] >= 0 ? readings.ave[currentHour] : errorText);
            d3.select("#ave52").text(+readings.ave52[currentHour] >= 0 ? readings.ave52[currentHour] : errorText);
        } else{
            const errorText = "N/A";
            d3.select("#countCurrentHour").text(errorText);
            d3.select("#count").text(errorText);
            d3.select("#ave").text(errorText);
            d3.select("#ave52").text(errorText);
        }
    }

    function onSuburbSelect(d){
        let currentSuburb = d.properties.name;
        let name = "No Suburb Selected";
        let population = "N/A";
        let percentage = "N/A";
        const isChecked = d3.select("#mapToggle").property("checked");
        d3.selectAll(".suburb").classed("active", false);
        if(!isChecked){
            d3.selectAll(".suburb").style("fill", mapColor);
        }

        if (oldSuburb !== currentSuburb){
            d3.select(this).classed("active", true);
            if(!isChecked){
                d3.select(this).style("fill", "#eeeeee");
            }
            oldSuburb = currentSuburb;
            name = currentSuburb;
        }else{
            oldSuburb = "";
        }

        let data = populationDict[d.properties.cartodb_id];
        if(data && oldSuburb){
            population =  data.total ;
            percentage = ((data.total/totalPopulationCount)*100).toFixed(2) + "%";
        }

        d3.select("#suburbName").text(name);
        d3.select("#suburbPopulation").text(population);
        d3.select("#suburbPercent").text(percentage);

    }

    function onSensorSelect(sensor) {
        //deselect old selection
        if(selectedSensor.id){
            if(sensor.id !== selectedSensor.id){
                const newReadings = findReadingFromSensorId(sensorReadings, sensorMappings[sensor.id]);
                d3.select('#sensor_' + selectedSensor.id).classed("selected", false);
                d3.select('#sensor_' + sensor.id).classed("selected", true);
                selectedSensor = sensor;
                updateSensorDetails(selectedSensor, newReadings, currentHour);
                sensorStatChart.update(newReadings);
            }
        }else{
            const newReadings = findReadingFromSensorId(sensorReadings, sensorMappings[sensor.id]);
            d3.select('#sensor_' + sensor.id).classed("selected", true);
            selectedSensor = sensor;
            updateSensorDetails(selectedSensor, newReadings, currentHour);
            sensorStatChart.update(newReadings);
        }

    }

    function findReadingFromSensorId(readings, names) {
        let mappedName = names.find(d => readings[d]);
        return readings[mappedName]
    }

    function onBackBtnClick() {
        const now = new Date(currentDate);
        now.setDate(now.getDate() - 1);
        if(now <= minDate){
            return;
        }
        currentDate.setDate(currentDate.getDate() - 1);
        loadNewReadings(currentDate, currentHour, sensorMappings);
    }

    function onNextBtnClick() {
        const now = new Date(currentDate);
        now.setDate(now.getDate() + 1);
        if(now >= maxDate){
            return;
        }
        currentDate.setDate(currentDate.getDate() + 1);
        loadNewReadings(currentDate, currentHour, sensorMappings);
    }

    function loadNewReadings(date, hour, mappings){
        showLoadingOverlay();
        d3.json(proxyURL + sensorDataURL + formatDate(date), function (error, data) {
            if(error){
                const status = +error.currentTarget.status;
                switch(status){
                    case 429:
                        alert("The server as reached the request limit. The limit will reset after 3 minutes");
                        break;
                    default:
                        alert("error: " + status);
                }
            }else{
                sensorReadings = data.thedata[0].sensors;
                totalObservationsPerHour = calcHourlyTotal(sensorReadings);
                updateAllUIElements(date, hour, selectedSensor, sensorReadings, mappings, totalObservationsPerHour);
                const newReadings = findReadingFromSensorId(sensorReadings, sensorMappings[selectedSensor.id]);
                sensorStatChart.update(newReadings);
            }
            hideLoadingOverlay()
        })
    }

    function formatDate(date) {
        return ("0" + date.getDate()).slice(-2) + "-" +
            ("0" + (date.getMonth()+1)).slice(-2) +"-"
            + date.getFullYear();
    }

    function calcHourlyTotal(sensors) {
        let totals = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
        for(let sensor in sensors){
            for(let i =0; i <= 23;i++){
                let value = sensors[sensor].counts[i];
                if(value >= 0){
                    totals[i] += value;
                }
            }
        }
        return totals;
    }

    function updateWidgetText(date, hour) {
        let currentMoment = moment(date.setHours(hour));
        //d3.select("#selectedDate").text(currentMoment.format("DD MMMM YYYY"));
        d3.select("#selectedDate").property("value",currentMoment.format("DD/MM/YYYY"));
        d3.select("#selectedHour").text(currentMoment.format("dddd h A"))
    }

    function onHourInputChange() {
        currentHour = this.value;
        updateAllUIElements(currentDate, currentHour, selectedSensor, sensorReadings, sensorMappings, totalObservationsPerHour);
    }

    function updateAllUIElements(date, hour, sensor, readings, mappings, totalPerHour) {
        updateWidgetText(date, hour);
        map.update(readings, totalPerHour, hour, sensorMappings);
        const newReadings = findReadingFromSensorId(readings, mappings[sensor.id]);
        updateSensorDetails(sensor, newReadings, hour)
    }

    function showLoadingOverlay() {
        d3.select("#loadingOverlay").classed("hide", false);
    }

    function hideLoadingOverlay() {
        d3.select("#loadingOverlay").classed("hide", true);
    }

    function setHourInput(time) {
        d3.select("#hourInput")
            .property("value", time);
    }

    function onAnimationClick() {
        if (!animationIsRunning) {
            animationIsRunning = true;
            setPlayButtonSymbol(animationSymbols.PAUSE);
            const sliderValue = parseInt(document.getElementById("hourInput").value);
            const sliderMax = parseInt(document.getElementById("hourInput").max);
            currentHour = sliderValue < sliderMax ? sliderValue : 0;
            setHourInput(currentHour);
            animationInterval = setInterval(() => {
                setHourInput(currentHour);
                updateAllUIElements(currentDate, currentHour, selectedSensor, sensorReadings, sensorMappings, totalObservationsPerHour);
                currentHour++;
                if (currentHour > 23) {
                    animationIsRunning = false;
                    setPlayButtonSymbol(animationSymbols.PLAY);
                    clearInterval(animationInterval);
                }
            }, 500);
        } else {
            animationIsRunning = false;
            setPlayButtonSymbol(animationSymbols.PLAY);
            clearInterval(animationInterval);
        }
    }

    function setPlayButtonSymbol(symbol) {
        const icon = d3.select("#animationBtn");
        icon.classed(animationSymbols.PLAY, animationSymbols.PLAY === symbol);
        icon.classed(animationSymbols.PAUSE, animationSymbols.PAUSE === symbol);
    }

    class lineChart{
        constructor(containerId="body", ratio=1){
            this.margin = {left: 50, top: 10, right: 20, bottom:50};
            this.parseTime = d3.timeParse("%H");
            const container = d3.select(containerId);

            this.dimensions =
                {width:parseInt(container.style("width")), height: parseInt(container.style("width"))*ratio};

            this.svg = container
                .append("svg")
                .attr("width", this.dimensions.width)
                .attr("height", this.dimensions.height);

            this.focus = this.svg.append('g')
                .attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')');

            this.height = this.dimensions.height - this.margin.top - this.margin.bottom;
            this.width = this.dimensions.width - this.margin.left - this.margin.right;

            this.xScale = d3.scaleTime()
                .domain([this.parseTime(0), this.parseTime(23)])
                .range([0, this.width])
                .nice();

            this.yScale = d3.scaleLinear()
                .range([this.height, 0]);

            this.xAxis = d3.axisBottom().scale(this.xScale).ticks(4).tickFormat(d3.timeFormat("%I %p"));

            this.yAxis = d3.axisLeft().scale(this.yScale).ticks(6) ;

            this.line = d3.line()
                .defined(d => +d >= 0)
                .x((d, i) => this.xScale(this.parseTime(i)))
                .y((d) => this.yScale(+d));

            this.focus.append("path")
                .attr("class", "line ave");

            this.focus.append("path")
                .attr("class", "line ave52");

            this.focus.append("path")
                .attr("class", "line counts selected");

            this.focus.append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(0," + this.height + ")")
                .call(this.xAxis);

            this.focus.append("g")
                .attr("class", "y axis")
        }
        update(data){
            let counts = [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1];
            let ave = [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1];
            let ave52 = [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1];
            let max =  1;
            if(data){
                counts = Object.values(data.counts);
                ave = Object.values(data.ave);
                ave52 = Object.values(data.ave52);
                max =  Math.max(1, d3.max(counts.concat(ave, ave52), d => +d));
            }

            this.yScale.domain([0, max]).nice();

            this.xAxis.scale(this.xScale);

            this.yAxis.scale(this.yScale);

            this.focus.select(".y.axis").call(this.yAxis);

            this.focus.select(".ave52")
                .transition()
                .duration(500)
                .attr("d", this.line(ave52));
            this.focus.select(".ave")
                .transition()
                .duration(500)
                .attr("d", this.line(ave));
            this.focus.select(".counts")
                .transition()
                .duration(500)
                .attr("d", this.line(counts));
        }
    }
    class suburbMap{
        constructor(containerId = "body", ratio = 1,geoData, sensorLocations, mappings, populationDict, tileColor = "steelblue") {
            this.tileColor = tileColor;
            this.mappings = mappings;
            this.sensorLocations = sensorLocations;
            this.populationDict = populationDict;
            this.geoData = geoData;
            this.sensorSize = 4;
            const container = d3.select(containerId);
            //Create SVG element
            this.svg = d3.select(containerId)
                .append("svg")
                .attr("class", "map-svg");

            this.dimensions =
                {width: parseInt(this.svg.style("width")), height: parseInt(this.svg.style("height"))};

            this.zoomFactor = this.dimensions.width * 1000;
            this.centerCoords = [144.95449198131038, -37.81239678699153];

            this.projection = d3.geoMercator()
                .translate([this.dimensions.width / 2, this.dimensions.height / 2])
                .center(this.centerCoords)
                .scale(this.zoomFactor);

            this.colorScale = d3.interpolateGreys;
            this.linearColorScale = d3.scaleLinear()
                .domain([4, 41])
                .range([0.5, 1]);
            //Define path generator
            this.path = d3.geoPath()
                .projection(this.projection);

            this.suburbs = this.svg.selectAll("path")
                .data(geoData.features)
                .enter()
                .append("path")
                .attr("d", this.path)
                .attr("class", "suburb")
                .style("fill", this.tileColor);

            this.suburbs.on("click", onSuburbSelect);

            this.sensorVolume = this.svg.append("g").selectAll("circle")
                .data(this.sensorLocations).enter()
                .append("circle")
                .attr("id",d => d.name)
                .attr("cx", d => this.projection([d.longitude, d.latitude])[0])
                .attr("cy", d => this.projection([d.longitude, d.latitude])[1])
                .attr("r", this.sensorSize)
                .attr("class", "sensor-volume");

            this.clickDummies = this.svg.append("g").selectAll("circle")
                .data(this.sensorLocations).enter()
                .append("circle")
                .attr("id",d => d.name)
                .attr("cx", d => this.projection([d.longitude, d.latitude])[0])
                .attr("cy", d => this.projection([d.longitude, d.latitude])[1])
                .attr("r", 20)
                .attr("class", "click-dummy");

            this.clickDummies.on("click", onSensorSelect);


            this.sensors = this.svg.append("g").selectAll("circle")
                .data(this.sensorLocations).enter()
                .append("circle")
                .attr("id",d => "sensor_" + d.id)
                .attr("cx", d => this.projection([d.longitude, d.latitude])[0])
                .attr("cy", d => this.projection([d.longitude, d.latitude])[1])
                .attr("r", this.sensorSize)
                .attr("class", "sensor")
                .classed("inactive", d => !this.mappings[d.id].some(n => sensorReadings[n]));

            this.sensors.on("click", onSensorSelect);

        }

        updateBackgroundColor(mode){
            const self = this;
            d3.selectAll(".suburb")
                .transition()
                .duration(500)
                .style("fill", function(d){
                    let color = "white";
                    switch (mode){
                        case "multi":
                            let suburb = self.populationDict[d.properties.cartodb_id];
                            if(suburb){
                                let value = (suburb.total/totalPopulationCount)*100;
                                color = value >= 4 ? self.colorScale(self.linearColorScale(value)) : "cccccc";
                            }
                            break;
                        default:
                            const elem = d3.select(this);
                            const isActive = elem.classed("active");
                            color =  isActive ? "#cccccc" : tileColor;
                    }
                    return color;
                });
        }

        update(readings, hourlyTotal, currentHour, mappings){
            d3.selectAll(".sensor")
                .classed("inactive", d => !mappings[d.id].some(n => readings[n]))
                .classed("no-reading", function (d) {
                    let mappedName = mappings[d.id].find(d => readings[d]);
                    let sensorData = readings[mappedName];
                    if(sensorData){
                        return sensorData.counts[currentHour] < 0;
                    }
                });

            d3.selectAll(".sensor-volume").attr("r", function (d) {
                let mappedName = mappings[d.id].find(d => readings[d]);
                let sensorData = readings[mappedName];
                if(sensorData){
                    const hasReading = sensorData.counts[currentHour] >= 0;
                    const total = hasReading >= 0 ? sensorData.counts[currentHour] : 0;
                    const result = (total/hourlyTotal[currentHour])*100;
                    return result >=0 ? result * 10 : this.sensorSize;
                }else{
                    return this.sensorSize;
                }
            });
        }
    }

    $('[data-toggle="popover"]').popover();

    $('[data-toggle="tooltip"]').tooltip();


    const picker = $('[data-toggle="datepicker"]').datepicker({
        autoHide: true,
        zIndex: 2048,
        startView: 2,
        format: "dd/mm/yyyy",
        weekStart: 1,
        startDate: "01/06/2009",
        endDate: new Date(),
        trigger: "#calendarPopover"
      });

    picker.on('hide.datepicker', function (e) {
        const selectedDate = picker.datepicker('getDate');
        const selectedDateString = formatDate(selectedDate);
        if(selectedDateString !== formatDate(currentDate)){
            currentDate = selectedDate;
            loadNewReadings(currentDate, currentHour, sensorMappings);
        }

    });

})();
