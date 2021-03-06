// GAME EVENTS =======================================================

var Events = {
  tick: function() {
    debug('Event tick')

    if (probability(wind_probability)) {
      var p = xy(
        game_origin.x - 1,
        bounds(Player.drone.p_drawn.y + rnds(-10, 10), [environment.ground.y0 + 2, game_size.y - 2])
      );

      debug('p:', p);
      (new Wind()).startGust(p);
    }
  }
}
