# Cost split
## Prerequisites
- Docker
- Docker Compose
- Docker daemon running
## Setup
Create a discord application [in the developer portal](https://discord.com/developers/applications). Then create a bot, and customize the name and icon. Disable `Public Bot`, and enable the server members and message content intents. Then on the sidebar go to the OAuth2 URL Generator. Enable bot, and copy the link. Paste the link in a new tab and add it to your server.

In the channels you want the bot to work in, give it `Send Messages`, `Embed Links`, `Add Reactions`, `Mention @everybody, @here and All Roles` and `Read Message History`. You may want to make a role for this if you plan on allowing it in multiple channels.

## Running
Copy `docker-compose-sample.yml` to `docker-compose.yml`. From the bot tab in you discord application, copy the token and paste it into the compose file. Also edit the allowed channels per the comments in the file ([This may be helpful to get the ID](https://www.remote.tools/remote-work/how-to-find-discord-id)). Optionally edit the first `./data` in the volumes to change the location where the data is stored.

Since this image is not prebuilt, you will have to build it yourself. With the compose file in place, run `docker-compose build` to build it, then `docker-compose up -d` to run it in the background, ot `docker-compose up` to run it in the foreground.

## Notes
In the data directory backups will be created each day. These can replace the main data.json file for DR as needed.