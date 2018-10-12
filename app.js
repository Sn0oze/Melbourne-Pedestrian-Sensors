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
    let totalObservationsPerHour = [];

    //Load in GeoJSON data
    const sensorLocationsURL = "http://www.pedestrian.melbourne.vic.gov.au/data/sensors.csv";
    const proxyURL = "https://mps-proxy.herokuapp.com/";
    const sensorDataURL = "https://compedapi.herokuapp.com/api/bydate/";

    d3.queue()
        .defer(d3.json, "data/melbourne_filtered.geojson")
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
                map = new suburbMap("#mapContainer", 1, cityOutlines, sensorLocations, sensorMappings, populationDict);
                // init line chart
                sensorStatChart = new lineChart("#lineChartContainer", 0.75);

                // set center sensor as default selection
                onSensorSelect(sensorLocations[30]);

                d3.select("#mapToggle").property("checked", false);

                d3.select("#hourInput")
                    .property("value", currentHour)
                    .on("input", onHourInputChange);

                updateAllUIElements(currentDate, currentHour, selectedSensor, sensorReadings, sensorMappings, totalObservationsPerHour);

                d3.select("#backBtn").on("click", onBackBtnClick);
                d3.select("#nextBtn").on("click", onNextBtnClick);

                d3.select("#animationBtn").on("click", onAnimationClick);

                d3.select("#countsLegend").on("mouseenter", d => d3.selectAll(".line.counts").classed("highlighted", true));
                d3.select("#countsLegend").on("mouseleave", d => d3.selectAll(".line.counts").classed("highlighted", false));
                d3.select("#aveLegend").on("mouseenter", d => d3.selectAll(".line.ave").classed("highlighted", true));
                d3.select("#aveLegend").on("mouseleave", d => d3.selectAll(".line.ave").classed("highlighted", false));
                d3.select("#ave52Legend").on("mouseenter", d => d3.selectAll(".line.ave52").classed("highlighted", true));
                d3.select("#ave52Legend").on("mouseleave", d => d3.selectAll(".line.ave52").classed("highlighted", false));

                d3.select("#mapToggle").on("change", onMapToggle);

                // remove loading overlay after everything is initialized
                d3.select("body").classed("overflow-hidden", false).select("#page-overlay").remove();
            }
        });

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
        d3.select("#sensorDescription").text(sensor.description);
        d3.select("#sensorId").text(sensor.id);
        d3.select("#sensorName").text(sensor.name);
        d3.select("#sensorYearInstalled").text(sensor.yearInstalled);
        if(readings){
            d3.select("#countCurrentHour").text(+readings.counts[currentHour] >= 0 ? readings.counts[currentHour] : "no data");
            d3.select("#count").text(+readings.counts[currentHour] >= 0 ? readings.counts[currentHour] : "no data");
            d3.select("#ave").text(+readings.ave[currentHour] >= 0 ? readings.ave[currentHour] : "no data");
            d3.select("#ave52").text(+readings.ave52[currentHour] >= 0 ? readings.ave52[currentHour] : "no data");
        } else{
            d3.select("#countCurrentHour").text("no data");
            d3.select("#count").text("no data");
            d3.select("#ave").text("no data");
            d3.select("#ave52").text("no data");
        }
    }

    function onSuburbSelect(d){
        let text = d.properties.name;
        let suburb = populationDict[d.properties.cartodb_id];
        if(suburb){
            text +=  ", total population: " + suburb.total +
                ", " + ((suburb.total/totalPopulationCount)*100).toFixed(2) + "%" +
                " population within the visible area"
        } else{
            text += ", total population: no data"
        }
        d3.select("#suburbSelection").text(text);
        d3.selectAll(".suburb").classed("highlighted", false);
        d3.select(this).classed("highlighted", true);
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
            currentHour = 0;
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

            this.xAxis = d3.axisBottom().scale(this.xScale).ticks(6).tickFormat(d3.timeFormat("%I %p"));

            this.yAxis = d3.axisLeft().scale(this.yScale);

            this.line = d3.line()
                .defined(d => +d >= 0)
                .x((d, i) => this.xScale(this.parseTime(i)))
                .y((d) => this.yScale(+d));

            this.focus.append("path")
                .attr("class", "line ave");

            this.focus.append("path")
                .attr("class", "line ave52");

            this.focus.append("path")
                .attr("class", "line counts");

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
        constructor(containerId = "body", ratio = 1, geoData, sensorLocations, mappings, populationDict) {
            this.mappings = mappings;
            this.sensorLocations = sensorLocations;
            this.populationDict = populationDict;
            this.geoData = geoData;
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

            this.colorScale = d3.interpolateBlues;
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
                .style("fill", "steelblue");

            this.suburbs.on("click", onSuburbSelect);

            this.sensorVolume = this.svg.append("g").selectAll("circle")
                .data(this.sensorLocations).enter()
                .append("circle")
                .attr("id",d => d.name)
                .attr("cx", d => this.projection([d.longitude, d.latitude])[0])
                .attr("cy", d => this.projection([d.longitude, d.latitude])[1])
                .attr("r", 3)
                .attr("class", "sensor-volume");

            this.sensorVolume.on("click", onSensorSelect);


            this.sensors = this.svg.append("g").selectAll("circle")
                .data(sensorLocations).enter()
                .append("circle")
                .attr("id",d => "sensor_" + d.id)
                .attr("cx", d => this.projection([d.longitude, d.latitude])[0])
                .attr("cy", d => this.projection([d.longitude, d.latitude])[1])
                .attr("r", 3)
                .attr("class", "sensor")
                .classed("inactive", d => !this.mappings[d.id].some(n => sensorReadings[n]));

            this.sensors.on("click", onSensorSelect);

        }

        updateBackgroundColor(mode){
            d3.selectAll(".suburb")
                .transition()
                .duration(500)
                .style("fill", (d) => {
                    let color = "grey";
                    switch (mode){
                        case "multi":
                            let suburb = this.populationDict[d.properties.cartodb_id];
                            if(suburb){
                                let value = (suburb.total/totalPopulationCount)*100;
                                color = value >= 4 ? this.colorScale(this.linearColorScale(value)) : "white";
                            }
                            break;
                        default:
                            color = "steelblue"
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
                    return result >=0 ? result *5 : 3;
                }else{
                    return 3;
                }
            });
        }
    }

    $('[data-toggle="popover"]').popover();

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

    d3.selectAll(".date-link").on("click", goToDate);

    function goToDate() {
        const date = d3.select(this);
        const day = date.attr("data-day");
        const month = date.attr("data-month");
        const year = date.attr("data-year");
        const newDate = new Date(currentDate);
        newDate.setDate(day);
        newDate.setMonth(month);
        newDate.setFullYear(year);
        if(formatDate(newDate) !== formatDate(currentDate)){
            currentDate = newDate;
            loadNewReadings(currentDate, currentHour, sensorMappings);
        }
    }

})();
