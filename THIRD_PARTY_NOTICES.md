# Third-party software

## PeerJS 1.5.5

- Project: https://github.com/peers/peerjs
- Source package: https://registry.npmjs.org/peerjs/-/peerjs-1.5.5.tgz
- Distribution file: `vendor/peerjs-1.5.5.min.js`
- License: MIT, reproduced in `vendor/PEERJS-LICENSE`.

The client bundle is committed locally to pin the version and avoid a runtime CDN dependency. PeerServer Cloud is used for signaling; actual game data is exchanged over WebRTC.
