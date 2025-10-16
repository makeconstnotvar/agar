import { P as Phaser, l as lookup } from "./vendor.js";
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
    this.socket = null;
    this.player = null;
    this.otherPlayers = /* @__PURE__ */ new Map();
    this.foods = /* @__PURE__ */ new Map();
    this.camera = null;
    this.gameWidth = 5e3;
    this.gameHeight = 5e3;
    this.targetPosition = { x: 0, y: 0 };
  }
  preload() {
  }
  create() {
    this.socket = lookup();
    this.camera = this.cameras.main;
    this.camera.setBounds(0, 0, this.gameWidth, this.gameHeight);
    this.cameras.main.setBackgroundColor("#1a1a2e");
    this.socket.on("gameState", (data) => {
      console.log("Received game state:", data);
      this.player = data.player;
      this.targetPosition.x = this.player.x;
      this.targetPosition.y = this.player.y;
      this.gameWidth = data.gameWidth;
      this.gameHeight = data.gameHeight;
      this.camera.setBounds(0, 0, this.gameWidth, this.gameHeight);
      this.player.graphics = this.add.graphics();
      console.log("Created player graphics");
      data.players.forEach((playerData) => {
        if (playerData.id !== this.player.id) {
          this.createOtherPlayer(playerData);
        }
      });
      data.foods.forEach((foodData) => {
        this.createFood(foodData);
      });
      console.log(
        `Created ${data.players.length} players and ${data.foods.length} foods`
      );
      this.centerCameraOnPlayer();
    });
    this.socket.on("gameUpdate", (data) => {
      this.updatePlayers(data.players);
    });
    this.socket.on("playerJoined", (playerData) => {
      this.createOtherPlayer(playerData);
      this.updatePlayersCount();
    });
    this.socket.on("playerLeft", (playerId) => {
      this.removeOtherPlayer(playerId);
      this.updatePlayersCount();
    });
    this.socket.on("foodEaten", (data) => {
      this.removeFood(data.foodId);
      this.createFood(data.newFood);
      if (data.playerId === this.player.id) {
        this.updateScore();
      }
    });
    this.input.on("pointermove", (pointer) => {
      if (this.player) {
        const worldPoint = this.camera.getWorldPoint(pointer.x, pointer.y);
        this.targetPosition.x = worldPoint.x;
        this.targetPosition.y = worldPoint.y;
      }
    });
    this.updateScore();
    this.updatePlayersCount();
  }
  update() {
    if (this.player && this.player.graphics) {
      this.socket.emit("playerMove", {
        x: this.targetPosition.x,
        y: this.targetPosition.y
      });
      this.player.graphics.clear();
      this.player.graphics.fillStyle(
        Phaser.Display.Color.HexStringToColor(this.player.color).color
      );
      this.player.graphics.fillCircle(
        this.player.x,
        this.player.y,
        this.player.radius
      );
      this.centerCameraOnPlayer();
      this.updateScore();
    } else {
      console.log("Update: player or player.graphics is null");
    }
  }
  centerCameraOnPlayer() {
    if (this.player) {
      this.camera.centerOn(this.player.x, this.player.y);
    }
  }
  createOtherPlayer(playerData) {
    console.log("Creating other player:", playerData.id);
    const graphics = this.add.graphics({ x: playerData.x, y: playerData.y });
    graphics.fillStyle(
      Phaser.Display.Color.HexStringToColor(playerData.color).color
    );
    graphics.fillCircle(0, 0, playerData.radius);
    this.otherPlayers.set(playerData.id, {
      graphics,
      data: playerData
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
    console.log("Creating food:", foodData.id);
    const graphics = this.add.graphics({ x: foodData.x, y: foodData.y });
    graphics.fillStyle(
      Phaser.Display.Color.HexStringToColor(foodData.color).color
    );
    graphics.fillCircle(0, 0, foodData.radius);
    this.foods.set(foodData.id, {
      graphics,
      data: foodData
    });
  }
  removeFood(foodId) {
    const food = this.foods.get(foodId);
    if (food) {
      food.graphics.destroy();
      this.foods.delete(foodId);
    }
  }
  updatePlayers(playersData) {
    const currentPlayerData = playersData.find((p) => p.id === this.player.id);
    if (currentPlayerData) {
      if (!this.player.graphics) {
        this.player.graphics = this.add.graphics();
      }
      this.player = { ...this.player, ...currentPlayerData };
    }
    playersData.forEach((playerData) => {
      if (playerData.id !== this.player.id) {
        const existingPlayer = this.otherPlayers.get(playerData.id);
        if (existingPlayer) {
          existingPlayer.data = playerData;
          existingPlayer.graphics.clear();
          existingPlayer.graphics.fillStyle(
            Phaser.Display.Color.HexStringToColor(playerData.color).color
          );
          existingPlayer.graphics.fillCircle(0, 0, playerData.radius);
          existingPlayer.graphics.x = playerData.x;
          existingPlayer.graphics.y = playerData.y;
        } else {
          this.createOtherPlayer(playerData);
        }
      }
    });
    const currentPlayerIds = new Set(playersData.map((p) => p.id));
    for (let [playerId] of this.otherPlayers) {
      if (!currentPlayerIds.has(playerId)) {
        this.removeOtherPlayer(playerId);
      }
    }
  }
  updateFoods(foodsData) {
    const currentFoodIds = new Set(foodsData.map((f) => f.id));
    for (let [foodId] of this.foods) {
      if (!currentFoodIds.has(foodId)) {
        this.removeFood(foodId);
      }
    }
    foodsData.forEach((foodData) => {
      const existingFood = this.foods.get(foodData.id);
      if (existingFood) {
        existingFood.graphics.clear();
        existingFood.graphics.fillStyle(
          Phaser.Display.Color.HexStringToColor(foodData.color).color
        );
        existingFood.graphics.fillCircle(0, 0, foodData.radius);
        existingFood.graphics.x = foodData.x;
        existingFood.graphics.y = foodData.y;
      } else {
        this.createFood(foodData);
      }
    });
  }
  updatePlayerGraphics() {
  }
  updateScore() {
    if (this.player) {
      document.getElementById("score").textContent = `Score: ${this.player.score} | Size: ${Math.round(this.player.radius)}`;
    }
  }
  updatePlayersCount() {
    const count = this.otherPlayers.size + 1;
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
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};
const game = new Phaser.Game(config);
window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
//# sourceMappingURL=index.js.map
