# Electron Dashboard

**Clone and run for a quick way to see Electron Dashboard in action.**

This is an Electron application to server as a Dashboard in Kiosk mode


## To Use

To clone and run this repository you'll need [Git](https://git-scm.com) and [Node.js](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer. From your command line:

```bash
# Install cec-utils
sudo apt-get install cec-utils

# Clone this repository
git clone https://github.com/tataille/elecdashboard
# Go into the repository
cd elecdashboard
# Install dependencies
npm install
# Run the app
npm start
```
# Start the Dashboard at PI startup

copy ed.sh one directory upper the project directory

```
 chmod +x ed.sh
 npm install pm2 -g
 pm2 start ed.sh
 pm2 save
 sudo pm2 startup systemd -u pi --hp /home/pi
 # Hide the cursor
 sudo apt-get install unclutter
 # Remove the screen saver
 nano ~/.config/lxsession/LXDE-pi/autostart
 #add "@unclutter -idle 0" in the file 
 #delete line "xscreensaver -nosplash"
 
```

Note: If you're using Linux Bash for Windows, [see this guide](https://www.howtogeek.com/261575/how-to-run-graphical-linux-desktop-applications-from-windows-10s-bash-shell/) or use `node` from the command prompt.

# Swagger documentation

Once started, navigate to http://<wallboard_host>:1338/api-docs to get the online documentation


## License

[Apache](LICENSE.md)

