const prisma = require('../prisma.js');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

//  Generate daily tasks 
function generateDailyTasks(totalPages, totalDays, studySessions) {
  if (!studySessions || studySessions.length === 0) {
    studySessions = [{ startTime: '08:00', endTime: '10:00' }];
  }

  const pagesPerDay  = Math.ceil(totalPages / totalDays);
  const pagesPerSlot = Math.ceil(pagesPerDay / studySessions.length);

  const tasks = [];
  let pageStart = 1;

  for (let day = 1; day <= totalDays; day++) {
    studySessions.forEach((session, index) => {
      const slotPageStart = pageStart + index * pagesPerSlot;
      const slotPageEnd   = Math.min(slotPageStart + pagesPerSlot - 1, totalPages);

      if (slotPageStart <= totalPages) {
        tasks.push({
          day,
          startTime:   session.startTime,
          endTime:     session.endTime,
          pages:       `${slotPageStart}–${slotPageEnd}`,
          completed:   false,
          rescheduled: false,
        });
      }
    });

    pageStart += pagesPerDay;
    if (pageStart > totalPages) break;
  }

  return tasks;
}

//  CREATE SCHEDULE 
// POST /api/schedules/generate
exports.createSchedule = async (req, res) => {
  try {
    const { course, totalDays, studySessions } = req.body;
    let totalPages = req.body.totalPages;

    // If a PDF was uploaded, count its pages automatically
    if (req.file) {
      try {
        const pdfBytes = fs.readFileSync(req.file.path);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        totalPages = pdfDoc.getPageCount();
        console.log(`PDF uploaded — auto counted ${totalPages} pages`);
      } catch (pdfError) {
        console.error('PDF reading error:', pdfError.message);
        return res.status(400).json({
          status: 'fail',
          message: 'Could not read the uploaded PDF. Please try again.',
        });
      }
    }

    // Validation
    if (!course || !totalDays) {
      return res.status(400).json({
        status: 'fail',
        message: "Please provide 'course' and 'totalDays'.",
      });
    }

    if (!totalPages) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please either upload a PDF or enter the total pages manually.',
      });
    }

    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Parse studySessions if it came as a string from form-data
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
        totalPages:    Number(totalPages),
        totalDays:     Number(totalDays),
        pagesPerDay,
        preferredTime: parsedSessions ? JSON.stringify(parsedSessions) : 'morning',
        fileUrl,
        dailyTasks,
      },
    });

    res.status(201).json({
      status: 'success',
      data: {
        schedule: newSchedule,
        summary: `To cover ${course} in ${totalDays} days, read ${pagesPerDay} pages per day.`,
      },
    });
  } catch (error) {
    console.error('Error saving schedule to database:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to save schedule to database.',
    });
  }
};

//  GET ALL SCHEDULES 
exports.getAllSchedules = async (req, res) => {
  try {
    const schedules = await prisma.schedule.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      status: 'success',
      results: schedules.length,
      data: { schedules },
    });
  } catch (error) {
    console.error('Error fetching schedules:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch schedules.' });
  }
};

//  GET ONE SCHEDULE 
exports.getSchedule = async (req, res) => {
  try {
    const schedule = await prisma.schedule.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!schedule) {
      return res.status(404).json({ status: 'fail', message: 'Schedule not found.' });
    }

    res.status(200).json({ status: 'success', data: { schedule } });
  } catch (error) {
    console.error('Error fetching schedule:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch schedule.' });
  }
};

// MARK A SPECIFIC SESSION COMPLETE 
// PATCH /api/schedules/:id/complete/:day/:sessionIndex
// Now supports completing individual sessions within a day
exports.completeTask = async (req, res) => {
  try {
    const { id, day } = req.params;
    const sessionIndex = req.params.sessionIndex !== undefined
      ? Number(req.params.sessionIndex)
      : null;

    const schedule = await prisma.schedule.findUnique({
      where: { id: Number(id) },
    });

    if (!schedule) {
      return res.status(404).json({ status: 'fail', message: 'Schedule not found.' });
    }

    let taskCount = 0;
    const updatedTasks = schedule.dailyTasks.map((task) => {
      if (task.day === Number(day)) {
        // If sessionIndex provided complete only that session
        // Otherwise complete all sessions for that day
        if (sessionIndex === null || taskCount === sessionIndex) {
          taskCount++;
          return { ...task, completed: true };
        }
        taskCount++;
      }
      return task;
    });

    const updated = await prisma.schedule.update({
      where: { id: Number(id) },
      data: { dailyTasks: updatedTasks },
    });

    res.status(200).json({
      status: 'success',
      message: `Task marked as complete.`,
      data: { schedule: updated },
    });
  } catch (error) {
    console.error('Error completing task:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to complete task.' });
  }
};

// RESCHEDULE MISSED TASKS 
// PATCH /api/schedules/:id/reschedule
// Finds ALL incomplete sessions and pushes them forward
// Each session gets its own new day — more flexible than before
exports.reschedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { extraDays } = req.body;

    if (!extraDays || extraDays < 1) {
      return res.status(400).json({
        status: 'fail',
        message: "Please provide 'extraDays' (minimum 1).",
      });
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: Number(id) },
    });

    if (!schedule) {
      return res.status(404).json({ status: 'fail', message: 'Schedule not found.' });
    }

    const incompleteTasks = schedule.dailyTasks.filter((t) => !t.completed);

    if (incompleteTasks.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'All tasks are already completed — nothing to reschedule.',
      });
    }

    const lastDay = Math.max(...schedule.dailyTasks.map((t) => t.day));

    // Push each incomplete session to a new day
    // Sessions from the same day stay grouped together on their new day
    const dayGroups = {};
    incompleteTasks.forEach((task) => {
      if (!dayGroups[task.day]) dayGroups[task.day] = [];
      dayGroups[task.day].push(task);
    });

    let newDayCounter = lastDay + 1;
    const rescheduledTasks = [];

    Object.values(dayGroups).forEach((group) => {
      group.forEach((task) => {
        rescheduledTasks.push({
          ...task,
          day: newDayCounter,
          rescheduled: true,
        });
      });
      newDayCounter++;
    });

    const completedTasks = schedule.dailyTasks.filter((t) => t.completed);
    const updatedTasks = [...completedTasks, ...rescheduledTasks];

    const updated = await prisma.schedule.update({
      where: { id: Number(id) },
      data: {
        totalDays: newDayCounter - 1,
        dailyTasks: updatedTasks,
      },
    });

    res.status(200).json({
      status: 'success',
      message: `${incompleteTasks.length} missed sessions rescheduled successfully. Sessions from the same day have been kept together.`,
      data: { schedule: updated },
    });
  } catch (error) {
    console.error('Error rescheduling:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to reschedule.' });
  }
};