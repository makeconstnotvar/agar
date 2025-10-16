const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.static(path.join(__dirname, "../client/build")));

// Игровое состояние
const gameState = {
  players: new Map(),
  foods: new Map(),
  foodGrid: new Map(),
  gameWidth: 5000,
  gameHeight: 5000,
};

const FOOD_CELL_SIZE = 100;

function getFoodCellKey(x, y) {
  const cellX = Math.floor(x / FOOD_CELL_SIZE);
  const cellY = Math.floor(y / FOOD_CELL_SIZE);
  return `${cellX}_${cellY}`;
}

function addFoodToState(food) {
  gameState.foods.set(food.id, food);
  const key = getFoodCellKey(food.x, food.y);
  let cell = gameState.foodGrid.get(key);
  if (!cell) {
    cell = new Set();
    gameState.foodGrid.set(key, cell);
  }
  cell.add(food.id);
}

function removeFoodFromState(foodId) {
  const food = gameState.foods.get(foodId);
  if (!food) {
    return;
  }
  const key = getFoodCellKey(food.x, food.y);
  const cell = gameState.foodGrid.get(key);
  if (cell) {
    cell.delete(foodId);
    if (cell.size === 0) {
      gameState.foodGrid.delete(key);
    }
  }
  gameState.foods.delete(foodId);
}

function spawnFood() {
  const newFood = {
    id: `food_${Date.now()}_${Math.random()}`,
    x: Math.random() * gameState.gameWidth,
    y: Math.random() * gameState.gameHeight,
    radius: 5,
    color: `hsl(${Math.random() * 360}, 70%, 60%)`,
  };
  addFoodToState(newFood);
  return newFood;
}

// Генерация начальной еды
function generateInitialFood() {
  for (let i = 0; i < 1000; i++) {
    spawnFood();
  }
}

generateInitialFood();

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // Создание нового игрока
  const player = {
    id: socket.id,
    x: Math.random() * gameState.gameWidth,
    y: Math.random() * gameState.gameHeight,
    radius: 20,
    color: `hsl(${Math.random() * 360}, 70%, 60%)`,
    name: `Player_${socket.id.slice(0, 4)}`,
    score: 0,
  };

  gameState.players.set(socket.id, player);

  // Отправка начального состояния новому игроку
  socket.emit("gameState", {
    player,
    players: Array.from(gameState.players.values()),
    foods: Array.from(gameState.foods.values()),
    gameWidth: gameState.gameWidth,
    gameHeight: gameState.gameHeight,
  });

  // Уведомление других игроков о новом игроке
  socket.broadcast.emit("playerJoined", player);

  // Обработка движения игрока
  socket.on("playerMove", (data) => {
    const player = gameState.players.get(socket.id);
    if (player) {
      player.targetX = data.x;
      player.targetY = data.y;
    }
  });

  // Обработка отключения игрока
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    gameState.players.delete(socket.id);
    io.emit("playerLeft", socket.id);
  });
});

// Игровой цикл (60 FPS)
setInterval(() => {
  // Обновление позиций игроков1
  gameState.players.forEach((player) => {
    if (player.targetX !== undefined && player.targetY !== undefined) {
      const speed = 200 / player.radius; // Меньшие клетки двигаются быстрее
      const dx = player.targetX - player.x;
      const dy = player.targetY - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 1) {
        const moveDistance = Math.min(speed, distance);
        player.x += (dx / distance) * moveDistance;
        player.y += (dy / distance) * moveDistance;
      }
    }

    // Проверка границ
    player.x = Math.max(
      player.radius,
      Math.min(gameState.gameWidth - player.radius, player.x),
    );
    player.y = Math.max(
      player.radius,
      Math.min(gameState.gameHeight - player.radius, player.y),
    );
  });

  // Проверка столкновений с едой
  gameState.players.forEach((player) => {
    const minCellX = Math.floor((player.x - player.radius) / FOOD_CELL_SIZE);
    const maxCellX = Math.floor((player.x + player.radius) / FOOD_CELL_SIZE);
    const minCellY = Math.floor((player.y - player.radius) / FOOD_CELL_SIZE);
    const maxCellY = Math.floor((player.y + player.radius) / FOOD_CELL_SIZE);

    const nearbyFoodIds = new Set();

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const cellKey = `${cellX}_${cellY}`;
        const cell = gameState.foodGrid.get(cellKey);
        if (!cell) {
          continue;
        }
        cell.forEach((foodId) => nearbyFoodIds.add(foodId));
      }
    }

    const consumedFoodIds = [];

    nearbyFoodIds.forEach((foodId) => {
      const food = gameState.foods.get(foodId);
      if (!food) {
        return;
      }
      const dx = player.x - food.x;
      const dy = player.y - food.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < player.radius) {
        player.radius += 0.5;
        player.score += 1;
        consumedFoodIds.push(foodId);
      }
    });

    consumedFoodIds.forEach((foodId) => {
      removeFoodFromState(foodId);
      const newFood = spawnFood();
      io.emit("foodEaten", { playerId: player.id, foodId, newFood });
    });
  });

  // Отправка обновленного состояния всем клиентам
  io.emit("gameUpdate", {
    players: Array.from(gameState.players.values()),
  });
}, 1000 / 60);

app.get("*_start_of_glob_character_", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/build/index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
