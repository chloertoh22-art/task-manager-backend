-- Task Manager database schema.
-- Run it with:  npm run db:init
-- (or paste it into the mysql client after "USE taskmanager;")

CREATE TABLE IF NOT EXISTS tasks (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status      ENUM('todo', 'in_progress', 'done') NOT NULL DEFAULT 'todo',
  due_date    DATE NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tasks_status (status)
);
