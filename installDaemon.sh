#!/bin/bash

read -p 'MQTT Broker Address: ' broker_address
read -p 'MQTT Broker Username: ' user
read -sp 'MQTT Broker Password: ' pass
echo
read -p 'Switch Name: ' switch_name
read -p 'Switch Path: ' switch_path
echo

pm2 start index.js --name mqttfileswitch -l ~/homecontrol/logs/mqttfileswitch -- $broker_address -username $user -password $pass -name "$switch_name" -path $switch_path
pm2 save
