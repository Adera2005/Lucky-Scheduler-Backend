const prisma = require('../prisma.js');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse-fixed');
const fs = require('fs');
const crypto = require('crypto');

// Generate daily study tasks evenly across sessions and days
function generateDailyTasks(totalPages, totalDays, studySessions) {
  if (!studySessions || studySessions.length === 0) {
    studySessions = [{ startTime: '08:00', endTime: '10:00' }];
  }

  const tasks = [];
  let currentPage = 1;

  for (let day = 1; day <= totalDays; day++) {
    if (currentPage > totalPages) break;

    const remainingPages = totalPages - currentPage + 1;
    const remainingDays = totalDays - day + 1;
    const pagesForToday = Math.ceil(remainingPages / remainingDays);

    let dayPageStart = currentPage;
    const dayPageEnd = Math.min(dayPageStart + pagesForToday - 1, totalPages);

    const numSessions = studySessions.length;
    const pagesPerSession = Math.ceil(pagesForToday / numSessions);

    studySessions.forEach((session) => {
      if (dayPageStart > dayPageEnd) return;

      const slotPageStart = dayPageStart;
      const slotPageEnd = Math.min(slotPageStart + pagesPerSession - 1, dayPageEnd);

      tasks.push({
        taskId: crypto.randomUUID(),
        day,
        startTime: session.startTime,
        endTime: session.endTime,
        pages: `${slotPageStart}–${slotPageEnd}`,
        completed: false,
        rescheduled: false
      });

      dayPageStart = slotPageEnd + 1;
    });

    currentPage = dayPageEnd + 1;
  }

  return tasks;
}

// Create schedule
exports.createSchedule = async (req, res) => {
  try {
    const { course, totalDays, studySessions } = req.body;
    let totalPages = req.body.totalPages;
    let pdfText = null;

    if (req.file) {
      try {
        const pdfBytes = fs.readFileSync(req.file.path);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        totalPages = pdfDoc.getPageCount();

        const parsedData = await pdfParse(pdfBytes);
        pdfText = parsedData.text;

      } catch (pdfError) {
        console.error('PDF reading error:', pdfError.message);
        return res.status(400).json({
          status: 'fail',
          message: 'Could not read the uploaded PDF. Please try again.'
        });
      }
    }

    if (!course || !totalDays) {
      return res.status(400).json({
        status: 'fail',
        message: "Please provide 'course' and 'totalDays'."
      });
    }

    if (!totalPages) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please either upload a PDF or enter the total pages manually.'
      });
    }

    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

    let parsedSessions = studySessions;
    if (typeof studySessions === 'string') {
      try {
        parsedSessions = JSON.parse(studySessions);
      } catch {
        parsedSessions = [{ startTime: '08:00', endTime: '10:00' }];
      }
    }

    const dailyTasks = generateDailyTasks(
      Number(totalPages),
      Number(totalDays),
      parsedSessions
    );

    const pagesPerDay = Math.ceil(Number(totalPages) / Number(totalDays));

    const newSchedule = await prisma.schedule.create({
      data: {
        course,
        totalPages: Number(totalPages),
        totalDays: Number(totalDays),
        pagesPerDay,
        preferredTime: parsedSessions ? JSON.stringify(parsedSessions) : 'morning',
        fileUrl,
        pdfText: pdfText ? pdfText.substring(0, 50000) : null,
        dailyTasks
      }
    });

    res.status(201).json({
      status: 'success',
      data: {
        schedule: newSchedule,
        summary: `To cover ${course} in ${totalDays} days, read ${pagesPerDay} pages per day.`
      }
    });

  } catch (error) {
    console.error('Error saving schedule to database:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to save schedule to database.'
    });
  }
};

// Get all schedules
exports.getAllSchedules = async (req, res) => {
  try {
    const schedules = await prisma.schedule.findMany({
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({
      status: 'success',
      results: schedules.length,
      data: { schedules }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch schedules.' });
  }
};

// Get one schedule
exports.getSchedule = async (req, res) => {
  try {
    const schedule = await prisma.schedule.findUnique({
      where: { id: Number(req.params.id) }
    });

    if (!schedule) {
      return res.status(404).json({ status: 'fail', message: 'Schedule not found.' });
    }

    res.status(200).json({ status: 'success', data: { schedule } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch schedule.' });
  }
};

// Complete a task (Uses taskId)
exports.completeTask = async (req, res) => {
  try {
    const { id, taskId } = req.params;

    const schedule = await prisma.schedule.findUnique({
      where: { id: Number(id) }
    });

    if (!schedule) {
      return res.status(404).json({ status: 'fail', message: 'Schedule not found.' });
    }

    const updatedTasks = schedule.dailyTasks.map((task) =>
      task.taskId === taskId ? { ...task, completed: true } : task
    );

    const updated = await prisma.schedule.update({
      where: { id: Number(id) },
      data: { dailyTasks: updatedTasks }
    });

    res.status(200).json({
      status: 'success',
      message: 'Session marked as complete.',
      data: { schedule: updated }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to complete task.' });
  }
};

// Reschedule all incomplete tasks over extraDays
exports.reschedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { extraDays } = req.body;

    const numExtraDays = Number(extraDays);
    if (!numExtraDays || numExtraDays < 1) {
      return res.status(400).json({
        status: 'fail',
        message: "Please provide 'extraDays' (minimum 1)."
      });
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: Number(id) }
    });

    if (!schedule) {
      return res.status(404).json({ status: 'fail', message: 'Schedule not found.' });
    }

    const incompleteTasks = schedule.dailyTasks.filter((task) => !task.completed);

    if (incompleteTasks.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'All tasks are already completed — nothing to reschedule.'
      });
    }

    const currentMaxDay = Math.max(...schedule.dailyTasks.map((t) => t.day), 0);
    const startDay = currentMaxDay + 1;

    const tasksPerDay = Math.ceil(incompleteTasks.length / numExtraDays);
    
    const rescheduledTasks = incompleteTasks.map((task, index) => {
      const addedDayOffset = Math.floor(index / tasksPerDay);
      const newDay = startDay + addedDayOffset;

      return {
        ...task,
        day: newDay,
        rescheduled: true
      };
    });

    const completedTasks = schedule.dailyTasks.filter((task) => task.completed);
    const updatedTasks = [...completedTasks, ...rescheduledTasks].sort((a, b) => a.day - b.day);

    const newTotalDays = Math.max(...updatedTasks.map((t) => t.day));

    const updated = await prisma.schedule.update({
      where: { id: Number(id) },
      data: {
        totalDays: newTotalDays,
        dailyTasks: updatedTasks
      }
    });

    res.status(200).json({
      status: 'success',
      message: `${incompleteTasks.length} missed sessions rescheduled successfully.`,
      data: { schedule: updated }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to reschedule.' });
  }
};

// Reschedule one session (Uses taskId)
exports.rescheduleSingleSession = async (req, res) => {
  try {
    const { id, taskId } = req.params;

    const schedule = await prisma.schedule.findUnique({
      where: { id: Number(id) }
    });

    if (!schedule) {
      return res.status(404).json({ status: 'fail', message: 'Schedule not found.' });
    }

    const lastDay = Math.max(...schedule.dailyTasks.map((task) => task.day), 0);

    const updatedTasks = schedule.dailyTasks.map((task) => {
      if (task.taskId === taskId && !task.completed) {
        return {
          ...task,
          day: lastDay + 1,
          rescheduled: true
        };
      }
      return task;
    });

    updatedTasks.sort((a, b) => a.day - b.day);

    const updated = await prisma.schedule.update({
      where: { id: Number(id) },
      data: {
        totalDays: Math.max(...updatedTasks.map((t) => t.day)),
        dailyTasks: updatedTasks
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Session rescheduled successfully.',
      data: { schedule: updated }
    });

  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to reschedule session.' });
  }
};