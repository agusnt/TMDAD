const spdy = require('spdy');
const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const amqp = require('amqp');

const passport = require('passport');
const mongoose = require('mongoose');

const cookieParser = require('cookie-parser');
const session = require('express-session');

const LanguageDetect = require('languagedetect');
const stopWord = require('stopword');

// Import db and passport
require('./db.js');
require('./passport')(passport);
const config = require('./config.js');
const MongoStore = require('connect-mongo')(session);

var lngDetector = new LanguageDetect();

// Broker address
var brokerURL = process.env.CLOUDAMQP_URL ? process.env.CLOUDAMQP_URL : "amqp://localhost";
var brokerURL = config.amqp;

//==============================================================================
// Connect to DB
//==============================================================================
mongoose.connect(config.db, function(err, res) {
  if(err) throw err;
  console.log('[DB] Connected to mongo');
});


//==============================================================================
// HTTP2 server
//==============================================================================

// Processor on/off
var on = true;

// Server config
const app = express();

// Express configuration
app.use(cookieParser());
app.use(bodyParser());
app.use(session(
{
    secret: 'secretkey',
    maxAge: new Date(Date.now() + 3600000),
    store: new MongoStore({mongooseConnection:mongoose.connection})  
}));

// Passport Configuration
app.use(passport.initialize());
app.use(passport.session());


// Passport routes
app.get('/auth/twitter', passport.authenticate('twitter'));
app.get('/auth/twitter/callback', passport.authenticate('twitter',
{ 
    successRedirect: '/',
    failureRedirect: '/' 
}));

app.use(bodyParser.urlencoded({ extended: false }));

// Server options
const options = {
    key: fs.readFileSync(__dirname + '/certificate/server.key'),
    cert:  fs.readFileSync(__dirname + '/certificate/server.crt')
}

app.get('/', (req, res) => {
    console.log("[HTTP2] new request to /");
    res.sendFile(__dirname + '/static/index.html');
});

var exRelatedWords = null;
var exStatistics = null;
var exLanguage = null;
var exChooser = null;
//==============================================================================
// Tweet Processors
//==============================================================================
/* Related Words */

// Turn off processor
app.post('/related_off', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (on)
    {
        on = !on;
        var data = {};
        data.action = "on";
        var encoded_payload = JSON.stringify(data);
        exRelatedWords.publish('relatedWords', encoded_payload, {})
        console.log("[RELATED] Off")
        return res.sendStatus(200);
    }
    res.sendStatus(409);
});

// Turn on processor
app.post('/related_on', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!on)
    {
        on = !on;
        var data = {};
        data.action = "off";
        var encoded_payload = JSON.stringify(data);
        exRelatedWords.publish('relatedWords', encoded_payload, {})
        console.log("[RELATED] On")
        return res.sendStatus(200);
    }
    res.sendStatus(409);
});

app.post('/related_broker', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);

    console.log(req.query.broker)
    var data = {};
    data.action = "broker"
    data.broker = req.query.broker
    var encoded_payload = JSON.stringify(data);
    exRelatedWords.publish('relatedWords', encoded_payload, {});
    return res.sendStatus(200);
});
//******************************************************************************
/* Statists */

// Turn off processor
app.post('/statistics_off', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (on)
    {
        on = !on;
        var data = {};
        data.action = "off";
        var encoded_payload = JSON.stringify(data);
        exStatistics.publish('statistics', encoded_payload, {})
        console.log("[STATISTICS] Off")
        return res.sendStatus(200);
    }
    res.sendStatus(409);
});

// Turn on processor
app.post('/statistics_on', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!on)
    {
        on = !on;
        var data = {};
        data.action = "on";
        var encoded_payload = JSON.stringify(data);
        exStatistics.publish('statistics', encoded_payload, {})
        console.log("[STATISTICS] On")
        return res.sendStatus(200);
    }
    res.sendStatus(409);
});

app.post('/statistics_broker', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);

    console.log(req.query.broker)
    var data = {};
    data.action = "broker"
    data.broker = req.query.broker
    var encoded_payload = JSON.stringify(data);
    exStatistics.publish('statistics', encoded_payload, {});
    return res.sendStatus(200);
});

//******************************************************************************
/* Language */

// Turn off processor
app.post('/language_off', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (on)
    {
        on = !on;
        var data = {};
        data.action = "off";
        var encoded_payload = JSON.stringify(data);
        exLanguage.publish('language', encoded_payload, {})
        console.log("[LANGUAGE] Off")
        return res.sendStatus(200);
    }
    res.sendStatus(409);
});

// Turn on processor
app.post('/language_on', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!on)
    {
        on = !on;
        var data = {};
        data.action = "on";
        var encoded_payload = JSON.stringify(data);
        exLanguage.publish('language', encoded_payload, {})
        console.log("[LANGUAGE] On")
        return res.sendStatus(200);
    }
    res.sendStatus(409);
});

app.post('/language_broker', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);

    console.log(req.query.broker)
    var data = {};
    data.action = "broker"
    data.broker = req.query.broker
    var encoded_payload = JSON.stringify(data);
    exLanguage.publish('language', encoded_payload, {});
    return res.sendStatus(200);
});

app.post('/language_translate', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    var data = {};
    data.action = "language"
    data.lang = req.query.lang
    var encoded_payload = JSON.stringify(data);
    exLanguage.publish('language', encoded_payload, {});
    return res.sendStatus(200);
});

//==============================================================================
// Chooser
//==============================================================================
// Turn off chooser
app.post('/chooser_off', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (on)
    {
        on = !on;
        var data = {};
        data.action = "off";
        var encoded_payload = JSON.stringify(data);
        exChooser.publish('chooser', encoded_payload, {})
        console.log("[CHOOSER] Off")
        return res.sendStatus(200);
    }
    res.sendStatus(409);
});

// Turn on chooser
app.post('/chooser_on', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!on)
    {
        on = !on;
        var data = {};
        data.action = "on";
        var encoded_payload = JSON.stringify(data);
        exChooser.publish('chooser', encoded_payload, {});
        console.log("[CHOOSER] On")
        return res.sendStatus(200);
    }
    res.sendStatus(409);
});

// Turn on chooser
app.post('/chooser_broker', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);

    console.log(req.query.broker)
    var data = {};
    data.action = "broker"
    data.broker = req.query.broker
    var encoded_payload = JSON.stringify(data);
    exChooser.publish('chooser', encoded_payload, {});
    return res.sendStatus(200);
});


// Load SSL and initialize server
spdy.createServer(options, app).listen(config.port, (error) => {
    if (error)
    {
        console.error(error);
        return process.exit(1)
    } else console.log('Listening on port: ' + config.port + '.')
});

//==============================================================================
// AMQP Connection
//==============================================================================

var connection = amqp.createConnection(
    { url: brokerURL + "?heartbeat=60", debug: true },
    { reconnect: { strategy: 'constant', initial: 1000 } }
);

// Connect to AMQP
connection.on('ready', function () {
    connection.exchange('relatedWords', { type: 'fanout' }, function(exchange) {
        console.log("[AMQP] relatedWords Ready")
        exRelatedWords = exchange;
    });
    connection.exchange('statistics', { type: 'fanout' }, function(exchange) {
        console.log("[AMQP] statistics Ready")
        exStatistics = exchange;
    });
    connection.exchange('language', { type: 'fanout' }, function(exchange) {
        console.log("[AMQP] language Ready")
        exLanguage = exchange;
    });
    connection.exchange('chooser', { type: 'fanout' }, function(exchange) {
        console.log("[AMQP] chooser Ready")
        exChooser = exchange;
    });
});
