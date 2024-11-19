const express = require('express');
const WebSocket = require('ws');
const app = express();
const http = require('http');
const server = http.createServer(app);

// Налаштування заголовка CSP для HTTP/HTTPS сервера
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' wss://*;");
  next();
});

// Створення WebSocket сервера
const wss = new WebSocket.Server({ server, path: '/ws' });

const cameras = {}; // Зберігання підключених камер
const clients = {}; // Зберігання підключених клієнтів

wss.on('connection', (ws, req) => {
  console.log('Підключено нового клієнта');
  
  ws.on('message', (message) => {
    let data;
    try{
      if(typeof JSON.parse(message.toString()) === 'object'){
        data = JSON.parse(message.toString());
      } else {
        data = message;
      }
    } catch (error) {
        // console.error('Помилка при обробці повідомлення:', error.message);
    }
    
    if (typeof data === 'object') {
      const { type, cameraId, boxId, command, angle, steps, direction } = data;

      if (type === 'camera') {
        // Камера підключилася
        cameras[cameraId] = ws;
        console.log(`Камера ${cameraId} підключена`);
      } else if (type === 'client') {
        // Клієнт підключився до боксу
        if (!clients[boxId]) {
          clients[boxId] = [];
        }
        clients[boxId].push(ws);
        console.log(`Клієнт підключений до боксу ${boxId}`);

        // Надсилаємо запит камері на передачу кадрів
        if (cameras[boxId]) {
          cameras[boxId].send(JSON.stringify({ type: 'request', boxId }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Камера не підключена' }));
        }
      } else if (type === 'command') {
        console.log("Команда", type, cameraId, boxId, command, angle, steps, direction)
        // Обробка команд для керування ESP-32 CAM
        if (cameras[boxId]) {
          cameras[boxId].send(JSON.stringify({ command, angle, steps, direction }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Камера не підключена' }));
        }
      } else if (type === 'getStatus') {
        // Запит статусу підключених камер і клієнтів
        const cameraList = Object.keys(cameras);
        const clientList = Object.keys(clients);
        console.log('Підключені камери:', cameraList);
        console.log('Підключені клієнти:', clientList);
        ws.send(JSON.stringify({ type: 'status', cameras: cameraList, clients: clientList }));
      }
    } else {
      // Обробка бінарних даних (наприклад, кадрів з камери)
      // console.log('Received binary frame data of length: ' + message.length);

      // Знаходимо перший клієнт для відповідного cameraId
      for (const cameraId in clients) {
        const clientList = clients[cameraId];
        if (clientList && clientList.length > 0) {
          const firstClient = clientList[cameraId];
          if (firstClient.readyState === WebSocket.OPEN) {
            firstClient.send(message); // Відправляємо кадр лише першому клієнту
            console.log(`Кадр від камери ${cameraId} надіслано першому клієнту`);
          } else {
            console.log(`Клієнт ${cameraId} не готовий до отримання кадру`);
          }
        }
      }
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

// Запускаємо сервер
server.listen(process.env.PORT || 7080, () => {
  console.log('Сервер запущено на порту', process.env.PORT || 7080);
});
