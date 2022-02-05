'use strict'

const fs = require('fs')
const log = console.log.bind(console)
const mqtt = require('mqtt')
const chokidar = require('chokidar')

function usage () {
    console.log('Usage: ')
    console.log('  node index.js <BROKER_ADDRESS> [-user <BROKER_USERNAME>] [-pass <BROKER_PASSWORD>] -name <SWITCH_NAME> -path <SWITCH_FILE>')
    console.log('  npm start -- <BROKER_ADDRESS> [-user <BROKER_USERNAME>] [-pass <BROKER_PASSWORD>] -name <SWITCH_NAME> -path <SWITCH_FILE>')
    process.exit()
}

function parseArgs () {
    let argi = 1

    const args = {
        mqttBrokerAddr: readArgValue(),
        switchName: "MQTTSWITCH",
        switchPath: "switchvalue"
    }

    function hasArg (arg) {
        return process.argv[argi] === arg
    }

    function readArgValue () {
        return process.argv[++argi] || usage()
    }

    for (argi++; argi < process.argv.length; argi++) {
        if (hasArg('-username')) {
            args.username = readArgValue()
        } else if (hasArg('-password')) {
            args.password = readArgValue()
        } else if (hasArg('-name')) {
            args.switchName = readArgValue()
        } else if (hasArg('-path')) {
            args.switchPath = readArgValue()
        }
    }

    return args
}

function writeSwitchState (switchStatePath, state) {
    try {
        fs.writeFileSync(switchStatePath, `${state}`, 'utf8')
    } catch (e) {
        console.log(`${new Date().toISOString()} Failed to write ${switchStatePath}. Exception: ${e}`)
    }
}

function watchSwitchState (args, device, onSwitchStateUpdate) {

    function sendState(state) {
        onSwitchStateUpdate({
            device: device,
            state: state
        })
    }
    
    function readSwitchState () {
        fs.readFile(args.switchPath, 'utf8', (err, switchStateData) => {
            if (err) {
                console.error(`Error reading switch state ${err}`)
                sendState(0) // could use availability topic here
                return
            }
            const switchState = parseInt(switchStateData)
            if (isNaN(switchState)) {
                console.error(`Switch state from ${args.switchPath} is NaN`)
                sendState(0) // could use availability topic here
                return
            }
            sendState(switchState)
        })
    }

    function fileUpdated (updatedPath) {
        log(`${new Date().toISOString()} File udpate: ${updatedPath}`)
        readSwitchState()
    }

    function onInitialStates () {
        readSwitchState()
    }

    const watcher = chokidar.watch(args.switchPath)
    watcher
        .on('add', fileUpdated)
        .on('change', fileUpdated)
}

function sendConfigurationMessages (client, device, switchName, deviceCommandTopic) {
    log(`${new Date().toISOString()} Send configuration messages for ${device}`)

    const topic = `home/switch/${device}/config`
    const configPayload = {
        object_id: `${device}`,
        unique_id: `${device}`,
        name: switchName,
        device_class: 'switch',
        command_topic: deviceCommandTopic,
        state_topic: `home/switch/${device}/state`
    }
    sendMessage(client, topic, JSON.stringify(configPayload), { retain: true })
}

function sendSwitchState (client, switchState) {
    const topic = `home/switch/${switchState.device}/state`
    const message = switchState.state === 1 ? 'ON' : 'OFF'
    sendMessage(client, topic, message)
}

function sendMessage (client, topic, payload, options) {
    log(`${new Date().toISOString()} Publishing to topic: ${topic}`)
    log(payload)
    client.publish(topic, payload, options)
}

function stateFromPayload (payload) {
    return payload === 'ON' ? 1 : 0
}

function run (args) {
    const device = args.switchName.toLowerCase().replace(/\s/g, "_")
    const deviceCommandTopic = `home/switch/${device}/set`
    const client = mqtt.connect(`mqtt://${args.mqttBrokerAddr}`, { username: args.username, password: args.password })
    client.on('connect', function () {
        sendConfigurationMessages(client, device, args.switchName, deviceCommandTopic)
        client.subscribe(deviceCommandTopic)
        watchSwitchState(args, device, switchState => {
            sendSwitchState(client, switchState)
        })
    })
    client.on('message', function (topic, message) {
        const payload = message.toString()
        log(`${new Date().toISOString()} Receive message ${payload}`)
        if (topic == deviceCommandTopic) {
            writeSwitchState(args.switchPath, stateFromPayload(payload))
        }
    })
    client.on('reconnect', function () {
        log(`${new Date().toISOString()} MQTT Client Reconnected`)
    })
    client.on('close', function () {
        log(`${new Date().toISOString()} MQTT Client Closed`)
    })
    client.on('disconnect', function () {
        log(`${new Date().toISOString()} MQTT Client Disconnected`)
    })
    client.on('offline', function () {
        log(`${new Date().toISOString()} MQTT Client Offline`)
    })
    client.on('end', function () {
        log(`${new Date().toISOString()} MQTT Client End`)
    })
    client.on('error', function (error) {
        log(`${new Date().toISOString()} MQTT Client Error ${error}`)
    })
    process.on('exit', () => { client.end() })
    process.on('SIGINT', () => {
        client.end()
        process.exit()
    })
}

run(parseArgs())
