const express = require('express');
const WebSocket = require('ws');
const app = express();
const http = require('http');
const server = http.createServer(app);

// Налаштування заголовка CSP для HTTP/HTTPS сервера
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; connect-src 'self' wss://*;");
  next();
});

// Створення WebSocket сервера
const wss = new WebSocket.Server({ server, path: '/ws' }); // Вказуємо шлях для WebSocket сервера

const cameras = {}; // Об'єкт для зберігання підключених камер
const clients = {}; // Об'єкт для зберігання підключених клієнтів

wss.on('connection', (ws, req) => {
  console.log('Підключено нового клієнта');

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    const { type, cameraId, boxId, frame } = data;

    if (type === 'camera') {
      cameras[cameraId] = ws;
      console.log(`Камера ${cameraId} підключена`);
    } else if (type === 'client') {
      if (!clients[boxId]) {
        clients[boxId] = [];
      }
      clients[boxId].push(ws);
      console.log(`Клієнт підключений до боксу ${boxId}`);
      if (cameras[boxId]) {
        cameras[boxId].send(JSON.stringify({ type: 'request', boxId }));
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Камера не підключена' }));
      }
    } else if (type === 'frame') {
      if (clients[cameraId]) {
        clients[cameraId].forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'frame', frame: frame.replace(/^data:image\/jpeg;base64,/, '') }));
          }
        });
      }
    } else if (type === 'getStatus') {
      const cameraList = Object.keys(cameras);
      const clientList = Object.keys(clients);
      console.log('Підключені камери:', cameraList);
      console.log('Підключені клієнти:', clientList);
    }
  });

  ws.on('close', () => {
    console.log('Клієнт відключився');
    for (const cameraId in cameras) {
      if (cameras[cameraId] === ws) {
        delete cameras[cameraId];
        console.log(`Камера ${cameraId} відключена`);
        break;
      }
    }
    for (const boxId in clients) {
      clients[boxId] = clients[boxId].filter((client) => client !== ws);
      if (clients[boxId].length === 0) {
        delete clients[boxId];
      }
      console.log(`Клієнт відключений від боксу ${boxId}`);
    }
  });

  ws.on('error', (error) => {
    console.error('Помилка WebSocket:', error);
  });
});

// Запускаємо сервер на Render
server.listen(process.env.PORT || 7080, () => {
  console.log('Сервер запущено на порту', process.env.PORT || 7080);
});
