const amqp = require('amqp');
const config = require('./config.js');

var translate = require('yandex-translate')(config.yandex)

// Broker address
var brokerURL = process.env.CLOUDAMQP_URL ? process.env.CLOUDAMQP_URL : "amqp://localhost";
var brokerURL = config.amqp;

//==============================================================================
// AMQP Connection
//==============================================================================

var connection = amqp.createConnection(
    { url: brokerURL + "?heartbeat=60", debug: true },
    { reconnect: { strategy: 'constant', initial: 1000 } }
);

var configTP = null;
var configDB = null;
var lang = 'es';

// Connect to AMQP
connection.on('ready', function () {
    connection.exchange('tp', { type: 'fanout' }, function(ex)
    {
        //console.log("[AMQP Dashboard] DB")
        configTP = ex; 
    });
    connection.exchange('db', { type: 'fanout' }, function(ex)
    {
        configDB = ex; 
    });
    connection.exchange('tweet', { type: 'fanout' }, function(exchange) {
        //console.log("[AMQP] Ready")

        connection.queue('my_queueLanguage', function(queue){
            //console.log('[AMQP] Created queue')
            queue.bind(exchange, '');

            queue.subscribe(function (message) {
                ///console.log('[AMQP] Msg Recieve')
                var encoded_payload = unescape(message.data)
                var data = JSON.parse(encoded_payload)
                var output = {};

                translate.translate(data.text, { to: lang }, function(err, res) {
                    output.textTr = res.text;
                    output.text = data.text;
                    output.search = data.search;
                    output.id = data.id_str;
                    encoded_payload = JSON.stringify(output);     
                    console.log(data.search)                
                    configTP.publish(data.search, encoded_payload, {}); 

                    output.created_at = data.created_at; 
                    encoded_payload = JSON.stringify(output);                     
                    configDB.publish('db', encoded_payload, {});                      
                });
            });
        });
    });
    connection.exchange('language', { type: 'fanout' }, function(exchange) {
        //console.log("[AMQP Statistics] Ready")

        connection.queue('my_queue2lang', function(queue){
            //console.log('[AMQP Statistics] Created queue2')
            queue.bind(exchange, '');

            queue.subscribe(function (message) {
                var encoded_payload = unescape(message.data)
                var data = JSON.parse(encoded_payload)
                console.log(data)
                if (data.action === 'off') connection.disconnect();
                else if (data.action === 'on')
                {
                    connection = amqp.createConnection(
                        { url: brokerURL + "?heartbeat=60", debug: true },
                        { reconnect: { strategy: 'constant', initial: 1000 } }
                    );
                }else if (data.action === 'broker')
                {
                    brokerURL = data.broker;
                    connection = amqp.createConnection(
                        { url: brokerURL + "?heartbeat=60", debug: true },
                        { reconnect: { strategy: 'constant', initial: 1000 } }
                    );
                } else if(data.action === 'language')
                {
                    lang = data.lang;
                }
            });
        });
    });
});

