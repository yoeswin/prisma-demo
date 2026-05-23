const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Get all user's todos
router.get('/', async (req, res) => {
  try {
    const todos = await prisma.todo.findMany({
      where: { userId: req.user.id }, // Populated by auth/JWT middleware
      orderBy: { createdAt: 'desc' }
    });
    res.json(todos);
  } catch (error) {
    console.error('Fetch todos error:', error);
    res.status(500).json({ message: 'Failed to fetch todos' });
  }
});

// Create a new todo
router.post('/', async (req, res) => {
  const { title } = req.body;
  try {
    const newTodo = await prisma.todo.create({
      data: { 
        title,
        userId: req.user.id
      },
    });
    res.status(201).json(newTodo);
  } catch (error) {
    console.error('Create todo error:', error);
    res.status(500).json({ message: 'Failed to create todo' });
  }
});

// Update a todo (toggle completed status)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  try {
    await prisma.todo.updateMany({
      where: { id, userId: req.user.id },
      data: { completed },
    });
    const updatedTodo = await prisma.todo.findUnique({ where: { id } });
    res.json(updatedTodo);
  } catch (error) {
    console.error('Update todo error:', error);
    res.status(500).json({ message: 'Failed to update todo' });
  }
});

// Delete a todo
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.todo.deleteMany({ where: { id, userId: req.user.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete todo error:', error);
    res.status(500).json({ message: 'Failed to delete todo' });
  }
});

module.exports = router;