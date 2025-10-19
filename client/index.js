import Phaser from "phaser";
import io from "socket.io-client";

class GameScene extends Phaser.Scene {
  constructor() {
    super({key: "GameScene"});
    this.socket = null;
    this.player = null;
    this.playerBody = null; // Физическое тело игрока
    this.otherPlayers = new Map();
    this.foods = new Map();
    this.foodGroup = null; // Физическая группа для еды
    this.eatenFood = new Set(); // Механизм для предотвращения мерцания
    this.camera = null;
    this.gameWidth = 5000;
    this.gameHeight = 5000;
    this.targetPosition = {x: 0, y: 0};
    this.lerpSpeed = 0.08; // Уменьшаем для более плавной интерполяции
    this.lastPositionUpdate = 0;
    this.positionUpdateInterval = 50; // Отправлять позицию каждые 50мс
  }

  preload() {
    // Загрузка не требуется
  }

  create() {
    this.socket = io();
    this.camera = this.cameras.main;
    this.camera.setBounds(0, 0, this.gameWidth, this.gameHeight);
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // Set physics world bounds to match game world
    this.physics.world.setBounds(0, 0, this.gameWidth, this.gameHeight);

    // Create a texture for the food
    const foodGraphics = this.make.graphics();
    foodGraphics.fillStyle(0x00ff00);
    foodGraphics.fillCircle(5, 5, 5);
    foodGraphics.generateTexture('food', 10, 10);
    foodGraphics.destroy();

    this.foodGroup = this.physics.add.group();

    this.socket.on("gameState", (data) => {
      this.gameWidth = data.gameWidth;
      this.gameHeight = data.gameHeight;
      this.camera.setBounds(0, 0, this.gameWidth, this.gameHeight);
      this.physics.world.setBounds(0, 0, this.gameWidth, this.gameHeight);

      this.createPlayer(data.player);

      this.physics.add.overlap(this.playerBody, this.foodGroup, this.eatFood, null, this);

      data.players.forEach((playerData) => {
        if (playerData.id !== this.socket.id) {
          this.createOtherPlayer(playerData);
        }
      });

      data.foods.forEach((foodData) => {
        this.createFood(foodData);
      });

      // Столкновения теперь обрабатываются через обновление состояния игры

      this.centerCameraOnPlayer();
    });

    this.socket.on("gameUpdate", (data) => {
      this.updatePlayers(data.players);
      // Еда теперь управляется сервером, чтобы избежать рассинхронизации
      this.updateFoods(data.foods);
    });

    this.socket.on("playerJoined", (playerData) => {
      if (playerData.id !== this.socket.id) {
        this.createOtherPlayer(playerData);
      }
      this.updatePlayersCount();
    });

    this.socket.on("playerLeft", (playerId) => {
      this.removeOtherPlayer(playerId);
      this.updatePlayersCount();
    });

    this.socket.on("foodEaten", (foodId) => {
      this.removeFood(foodId);
    });

    this.socket.on("foodCreated", (foodData) => {
      this.createFood(foodData);
    });

    this.input.on("pointermove", (pointer) => {
      if (this.playerBody) {
        const worldPoint = this.camera.getWorldPoint(pointer.x, pointer.y);
        this.targetPosition.x = worldPoint.x;
        this.targetPosition.y = worldPoint.y;
      }
    });

    this.updateScore();
    this.updatePlayersCount();
  }

  update(time, delta) {
    if (this.playerBody) {
      const distance = Phaser.Math.Distance.Between(
        this.playerBody.x,
        this.playerBody.y,
        this.targetPosition.x,
        this.targetPosition.y,
      );

      if (distance < 1) {
        this.playerBody.body.setVelocity(0);
      } else {
        const angle = Phaser.Math.Angle.Between(
          this.playerBody.x,
          this.playerBody.y,
          this.targetPosition.x,
          this.targetPosition.y,
        );
        const speed = 200 / (this.player.radius / 20);
        this.physics.velocityFromRotation(angle, speed, this.playerBody.body.velocity);
      }

      this.player.x = this.playerBody.x;
      this.player.y = this.playerBody.y;

      // Отправляем позицию на сервер с ограничением частоты
      if (time - this.lastPositionUpdate > this.positionUpdateInterval) {
        this.socket.emit("playerMove", {x: this.player.x, y: this.player.y});
        this.lastPositionUpdate = time;
      }

      // Обновляем цель камеры
      this.centerCameraOnPlayer();
    }

    // Интерполяция других игроков
    this.interpolateOtherPlayers();
  }


  centerCameraOnPlayer() {
    if (this.playerBody) {
      this.camera.centerOn(this.playerBody.x, this.playerBody.y);
    }
  }

  createPlayer(playerData) {
    this.player = playerData;
    this.targetPosition = {x: this.player.x, y: this.player.y};

    const playerGraphics = this.add.graphics({x: this.player.x, y: this.player.y});
    playerGraphics.lineStyle(2, 0x000000, 1); // Четкая черная обводка
    playerGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(this.player.color).color);
    playerGraphics.fillCircle(0, 0, this.player.radius);
    playerGraphics.strokeCircle(0, 0, this.player.radius);

    this.physics.world.enable(playerGraphics);
    // Устанавливаем круглый якорь и корректное смещение
    playerGraphics.body.setCircle(
      this.player.radius,
      -this.player.radius,
      -this.player.radius,
    );
    playerGraphics.body.setCollideWorldBounds(true);

    this.playerBody = playerGraphics;
    this.player.graphics = playerGraphics;
  }

  createOtherPlayer(playerData) {
    const graphics = this.add.graphics({x: playerData.x, y: playerData.y});
    graphics.lineStyle(2, 0x000000, 1); // Четкая черная обводка
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(playerData.color).color);
    graphics.fillCircle(0, 0, playerData.radius);
    graphics.strokeCircle(0, 0, playerData.radius);

    this.otherPlayers.set(playerData.id, {
      ...playerData,
      graphics: graphics,
      lerpPosition: {x: playerData.x, y: playerData.y},
    });
  }

  removeOtherPlayer(playerId) {
    const player = this.otherPlayers.get(playerId);
    if (player) {
      player.graphics.destroy();
      this.otherPlayers.delete(playerId);
    }
  }

  createFood(foodData) {
    if (this.foods.has(foodData.id)) return;

    const food = this.foodGroup.create(foodData.x, foodData.y, 'food');
    food.setData('id', foodData.id);
    const scale = foodData.radius / 5;
    food.setScale(scale);
    food.body.setCircle(5);
    
    this.foods.set(foodData.id, food);
  }

  eatFood(player, food) {
    if (!food.active) {
      return;
    }
    const foodId = food.getData('id');
    if (foodId) {
      this.eatenFood.add(foodId);
      this.socket.emit('eatFood', foodId);
      this.removeFood(foodId);

      this.time.delayedCall(1000, () => {
        this.eatenFood.delete(foodId);
      });
    }
  }

  removeFood(foodId) {
    const food = this.foods.get(foodId);
    if (food) {
      this.foodGroup.remove(food, true, true);
      this.foods.delete(foodId);
    }
  }

  updateFoods(foodsData) {
    const serverFoodIds = new Set(foodsData.map(f => f.id));

    // Добавляем новую еду
    foodsData.forEach(foodData => {
      if (!this.foods.has(foodData.id) && !this.eatenFood.has(foodData.id)) {
        this.createFood(foodData);
      }
    });

    // Удаляем съеденную еду
    this.foods.forEach((food, foodId) => {
      if (!serverFoodIds.has(foodId)) {
        this.removeFood(foodId);
      }
    });
  }


  updatePlayers(playersData) {
    const serverPlayerIds = new Set();
    playersData.forEach((playerData) => {
      serverPlayerIds.add(playerData.id);

      if (playerData.id === this.socket.id) {
        const radiusChanged = this.player.radius !== playerData.radius;
        const scoreChanged = this.player.score !== playerData.score;

        this.player.radius = playerData.radius;
        this.player.score = playerData.score;

        if (radiusChanged) {
          // Обновляем физическое тело
          this.playerBody.body.setCircle(this.player.radius, -this.player.radius, -this.player.radius);

          // Перерисовываем игрока с четкими контурами
          this.player.graphics.clear();
          this.player.graphics.lineStyle(2, 0x000000, 1);
          this.player.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(this.player.color).color);
          this.player.graphics.fillCircle(0, 0, this.player.radius);
          this.player.graphics.strokeCircle(0, 0, this.player.radius);
        }
        
        if (scoreChanged || radiusChanged) {
            this.updateScore();
        }
      } else {
        let otherPlayer = this.otherPlayers.get(playerData.id);
        if (otherPlayer) {
          // Обновляем позицию других игроков с сервера
          otherPlayer.x = playerData.x;
          otherPlayer.y = playerData.y;

          if (otherPlayer.radius !== playerData.radius) {
            otherPlayer.radius = playerData.radius;
            // Перерисовываем с четкими контурами
            otherPlayer.graphics.clear();
            otherPlayer.graphics.lineStyle(2, 0x000000, 1);
            otherPlayer.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(playerData.color).color);
            otherPlayer.graphics.fillCircle(0, 0, playerData.radius);
            otherPlayer.graphics.strokeCircle(0, 0, playerData.radius);
          }
        } else {
          this.createOtherPlayer(playerData);
        }
      }
    });

    this.otherPlayers.forEach((player, playerId) => {
      if (!serverPlayerIds.has(playerId)) {
        this.removeOtherPlayer(playerId);
      }
    });
  }

  interpolateOtherPlayers() {
    this.otherPlayers.forEach((player) => {
      player.lerpPosition.x = Phaser.Math.Linear(player.lerpPosition.x, player.x, this.lerpSpeed);
      player.lerpPosition.y = Phaser.Math.Linear(player.lerpPosition.y, player.y, this.lerpSpeed);
      player.graphics.setPosition(player.lerpPosition.x, player.lerpPosition.y);
    });
  }

  updateScore() {
    if (this.player) {
      document.getElementById("score").textContent = `Score: ${this.player.score} | Size: ${Math.round(this.player.radius)}`;
    }
  }

  updatePlayersCount() {
    const count = this.otherPlayers.size + (this.player ? 1 : 0);
    document.getElementById("players").textContent = `Players: ${count}`;
  }
}

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: "gameContainer",
  scene: GameScene,
  physics: {
    default: "arcade",
    arcade: {
      gravity: {y: 0},
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});