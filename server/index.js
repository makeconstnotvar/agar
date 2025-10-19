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
  foodGrid: new Map(), // Оставляем для быстрого поиска, если понадобится
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
    color: "#00FF00",
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

  const player = {
    id: socket.id,
    x: Math.random() * gameState.gameWidth,
    y: Math.random() * gameState.gameHeight,
    radius: 20,
    color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`,
    name: `Player_${socket.id.slice(0, 4)}`,
    score: 0,
  };

  gameState.players.set(socket.id, player);

  socket.emit("gameState", {
    player,
    players: Array.from(gameState.players.values()),
    foods: Array.from(gameState.foods.values()),
    gameWidth: gameState.gameWidth,
    gameHeight: gameState.gameHeight,
  });

  socket.broadcast.emit("playerJoined", player);

  socket.on("playerMove", (data) => {
    const player = gameState.players.get(socket.id);
    if (player) {
      // Полностью доверяем координатам от клиента
      player.x = data.x;
      player.y = data.y;
    }
  });

  socket.on("eatFood", (foodId) => {
    const player = gameState.players.get(socket.id);
    const food = gameState.foods.get(foodId);

    if (player && food) {
        player.score += 1;
        player.radius += 0.5;

        removeFoodFromState(foodId);
        const newFood = spawnFood();
        
        // Отправляем отдельные, более легковесные события
        io.emit("foodEaten", foodId);
        io.emit("foodCreated", newFood);
    }
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    gameState.players.delete(socket.id);
    io.emit("playerLeft", socket.id);
  });
});

// Игровой цикл (20 FPS для экономии ресурсов)
setInterval(() => {
  // Логика движения игрока полностью на клиенте
  // Проверка границ полностью на клиенте

  // Отправляем всем клиентам полное состояние игры
  io.emit("gameUpdate", {
    players: Array.from(gameState.players.values()),
    foods: Array.from(gameState.foods.values()),
  });
}, 1000 / 20); // Снижаем частоту до 20 FPS

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/build/index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
