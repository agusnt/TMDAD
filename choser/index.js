const spdy = require('spdy');
const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const amqp = require('./amqp.js');
const Twitter = require('node-tweet-stream');
const config = require('./config');

// Global variables
var t = new Twitter(
{
    consumer_key: config.twitter.key,
    consumer_secret: config.twitter.key_secret,
    token: config.twitter.token,
    token_secret: config.twitter.token_secret
});
var searchParameter = []

// Broker address
//var brokerURL = process.env.CLOUDAMQP_URL ? process.env.CLOUDAMQP_URL : "amqp://localhost";
var brokerURL = config.amqp;

/**
 * Initialize connection with AMQP
 */
amqp.startAMQ(brokerURL, amqp.startPublisher);

// Tweet configuration
t.on('tweet', function (tweet) {
    searchParameter.forEach(function(item)
    {
        if (tweet.text.indexOf(item))
        {
            tweet.search = item;
            amqp.publish("", "tweet", new Buffer(JSON.stringify(tweet)));
            //console.log("[Chooser] Published Tweet");
        }
    });
});
 
t.on('error', function (err) {
    console.error('Oh no')
});

//==============================================================================
/**
 * Configuration of sever
 */
const app = express();

app.use(bodyParser.urlencoded({ extended: false }));

// Server options
const options = {
    key: fs.readFileSync(__dirname + '/certificate/server.key'),
    cert:  fs.readFileSync(__dirname + '/certificate/server.crt')
}

//------------------------------------------------------------------------------
/* Server routes */

// Subscribe twitter
app.post('/sub', (req, res) => {
    if (req.body.tweet !== undefined)
    {
        if (searchParameter.indexOf(req.body.tweet) === -1)
        {
            searchParameter.push(req.body.tweet);
            t.track(req.body.tweet)
        }
        res.sendStatus(200);
        console.log("[Chooser] Subscription init")
    } else res.sendStatus(400);
});

// unsubscribe twitter
app.delete('/usub', (req, res) => {
    if (req.body.tweet !== undefined)
    {
        console.log("[Chooser] Unsubcription")
        var index = searchParameter.indexOf(req.body.tweet);
        if (index > -1) searchParameter.splice(index, 1);
        t.untrack(req.body.tweet)
        res.sendStatus(200);
    } else res.sendStatus(400);
});

//------------------------------------------------------------------------------
// Load SSL and initialize server
spdy.createServer(options, app).listen(config.port, (error) => {
    if (error)
    {
        console.error(error)
        return process.exit(1)
    } else 
    {
        console.log('Listening on port: ' + config.port + '.')
    }
});

