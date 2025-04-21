# wanna-nest
Wanna Wanna backend build with Nest.js

## About
Wanna Wanna is an experimental grocery list app, focused on sharing,
notifications, new UX patterns, and location-based features later on.

The mobile app is built with React Native and Expo, and the code can be found here: https://github.com/leechy/wanna

This is the backend repository, built with Nest.js and TypeScript.

All the data is stored in a SQLite database, and the app is hosted in a
Digital Ocean droplet.

If you want to run this server on your droplet, you should install
SQLite3 and Node.js first. The rest can be done with the GitHub deploy action.


## Getting Started
If you want to hack a bit on this project, you can easily run it locally with Node.js and SQLite3.

```bash
$ npm run start:dev
```

The location of the SQLite3 database is in the `prisma` folder. Database will be created automatically if it doesn't exist.

### Structure of the project
It's a standard Nest.js project, with a WebSocket gateway.

Structure is also pretty standart with folders for each enity in the `src` folder. Keeping there the service and controller together with the DTOs.

Extra folders there are services for the EventEmitter and the Prisma client. And the gateway for the WebSocket server.

### WebSocket
The WebSocker server uses Socket.io and its build-in channel system, to
be able to send messages to multiple clients at once.

### Rest API
Not used for the app. Came in handy for testing and debugging. You can use Postman to test it.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Need help? Open an issue or contact me on Twitter [@leechy](https://twitter.com/leechylabs).
