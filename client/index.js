import Phaser from "phaser";
import io from "socket.io-client";

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
    this.socket = null;
    this.player = null;
    this.playerBody = null; // Физическое тело игрока
    this.otherPlayers = new Map();
    this.foods = new Map();
    this.foodGroup = null; // Физическая группа для еды
    this.camera = null;
    this.gameWidth = 5000;
    this.gameHeight = 5000;
    this.targetPosition = { x: 0, y: 0 };
    this.lerpSpeed = 0.2; // Увеличим скорость для более плавной интерполяции
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

    this.socket.on("gameState", (data) => {
      this.gameWidth = data.gameWidth;
      this.gameHeight = data.gameHeight;
      this.camera.setBounds(0, 0, this.gameWidth, this.gameHeight);
      this.physics.world.setBounds(0, 0, this.gameWidth, this.gameHeight);

      this.createPlayer(data.player);

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

  update() {
    if (this.playerBody) {
      const speed = 200 / (this.player.radius / 20);
      this.physics.moveTo(
        this.playerBody,
        this.targetPosition.x,
        this.targetPosition.y,
        speed,
      );

      this.player.x = this.playerBody.x;
      this.player.y = this.playerBody.y;

      this.socket.emit("playerMove", { x: this.player.x, y: this.player.y });
      this.centerCameraOnPlayer();
    }
    this.interpolateOtherPlayers();
  }
  

  centerCameraOnPlayer() {
    if (this.playerBody) {
      this.camera.centerOn(this.playerBody.x, this.playerBody.y);
    }
  }

  createPlayer(playerData) {
    this.player = playerData;
    this.targetPosition = { x: this.player.x, y: this.player.y };

    const playerGraphics = this.add.graphics({ x: this.player.x, y: this.player.y });
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
    const graphics = this.add.graphics({ x: playerData.x, y: playerData.y });
    graphics.lineStyle(2, 0x000000, 1); // Четкая черная обводка
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(playerData.color).color);
    graphics.fillCircle(0, 0, playerData.radius);
    graphics.strokeCircle(0, 0, playerData.radius);

    this.otherPlayers.set(playerData.id, {
      ...playerData,
      graphics: graphics,
      lerpPosition: { x: playerData.x, y: playerData.y },
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

    // Создаем графику с четкими контурами
    const graphics = this.add.graphics({ x: foodData.x, y: foodData.y });
    graphics.lineStyle(1, 0x000000, 1); // Четкая черная обводка
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(foodData.color).color);
    graphics.fillCircle(0, 0, foodData.radius);
    graphics.strokeCircle(0, 0, foodData.radius);

    // Включаем физику для графики
    this.physics.world.enable(graphics);
    graphics.body.setCircle(foodData.radius);
    graphics.body.setCollideWorldBounds(true);

    this.foods.set(foodData.id, graphics);
  }

  removeFood(foodId) {
    const food = this.foods.get(foodId);
    if (food) {
      food.destroy();
      this.foods.delete(foodId);
    }
  }
  
  updateFoods(foodsData) {
    const serverFoodIds = new Set(foodsData.map(f => f.id));
    
    // Добавляем новую еду
    foodsData.forEach(foodData => {
        if (!this.foods.has(foodData.id)) {
            this.createFood(foodData);
        }
    });

    // Удаляем съеденную еду
    this.foods.forEach(food => {
        if (!serverFoodIds.has(food.name)) {
            this.removeFood(food.name);
        }
    });
}


  updatePlayers(playersData) {
     const serverPlayerIds = new Set();
     playersData.forEach((playerData) => {
        serverPlayerIds.add(playerData.id);

        if (playerData.id === this.socket.id) {
            // Обновляем только данные, не позицию
            if (this.player.radius !== playerData.radius) {
                this.player.radius = playerData.radius;
                this.player.score = playerData.score;

                this.playerBody.body.setCircle(this.player.radius, -this.player.radius, -this.player.radius);

                // Перерисовываем игрока с четкими контурами
                this.player.graphics.clear();
                this.player.graphics.lineStyle(2, 0x000000, 1);
                this.player.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(this.player.color).color);
                this.player.graphics.fillCircle(0, 0, this.player.radius);
                this.player.graphics.strokeCircle(0, 0, this.player.radius);
                this.updateScore();
            }
        } else {
            let otherPlayer = this.otherPlayers.get(playerData.id);
            if (otherPlayer) {
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
      gravity: { y: 0 },
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
