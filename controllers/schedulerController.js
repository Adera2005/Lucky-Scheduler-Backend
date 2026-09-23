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
    const dayPageEnd = Math.min(
      dayPageStart + pagesForToday - 1,
      totalPages
    );

    const numSessions = studySessions.length;
    const pagesPerSession = Math.ceil(pagesForToday / numSessions);

    studySessions.forEach((session) => {
      if (dayPageStart > dayPageEnd) return;

      const slotPageStart = dayPageStart;
      const slotPageEnd = Math.min(
        slotPageStart + pagesPerSession - 1,
        dayPageEnd
      );

      tasks.push({
        day,
        startTime: session.startTime,
        endTime: session.endTime,
        pageStart: slotPageStart,
        pageEnd: slotPageEnd,
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
    studentId: req.student.id,
    course,
    totalPages: Number(totalPages),
    totalDays: Number(totalDays),
    pagesPerDay,
    fileUrl,
    pdfText: pdfText ? pdfText.substring(0, 50000) : null,

    sessions: {
      create: parsedSessions.map((session) => ({
        startTime: session.startTime,
        endTime: session.endTime
      }))
    },

    tasks: {
      create: dailyTasks.map((task) => ({
        day: task.day,
        startTime: task.startTime,
        endTime: task.endTime,
        pageStart: task.pageStart,
        pageEnd: task.pageEnd,
        completed: false,
        rescheduled: false
      }))
    }
  },

  include: {
    sessions: true,
    tasks: true
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
      where: {
        studentId: req.student.id
      },
      include: {
        sessions: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json({
      status: 'success',
      results: schedules.length,
      data: {
        schedules
      }
    });
  } catch (error) {
    console.error('Error fetching schedules:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch schedules.'
    });
  }
};

// Get one schedule
exports.getSchedule = async (req, res) => {
  try {
    const schedule = await prisma.schedule.findFirst({
      where: {
        id: Number(req.params.id),
        studentId: req.student.id
      },
      include: {
        sessions: true,
        tasks: {
          orderBy: [
            { day: 'asc' },
            { startTime: 'asc' }
          ]
        }
      }
    });

    if (!schedule) {
      return res.status(404).json({
        status: 'fail',
        message: 'Schedule not found.'
      });
    }

    res.status(200).json({
      status: 'success',
      data: { schedule }
    });
  } catch (error) {
    console.error('Error fetching schedule:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch schedule.'
    });
  }
};

// Complete a task (Uses taskId)
exports.completeTask = async (req, res) => {
  try {
    const { id, taskId } = req.params;

    const task = await prisma.studyTask.findFirst({
      where: {
        id: Number(taskId),
        scheduleId: Number(id),
        schedule: {
          studentId: req.student.id
        }
      }
    });

    if (!task) {
      return res.status(404).json({
        status: 'fail',
        message: 'Task not found.'
      });
    }

    const updatedTask = await prisma.studyTask.update({
      where: {
        id: task.id
      },
      data: {
        completed: true
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Session marked as complete.',
      data: {
        task: updatedTask
      }
    });

  } catch (error) {
    console.error('Error completing task:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Failed to complete task.'
    });
  }
};

// Reschedule one session (Uses taskId)
exports.rescheduleSingleSession = async (req, res) => {
  try {
    const { id, taskId } = req.params;

    const task = await prisma.studyTask.findFirst({
      where: {
        id: Number(taskId),
        scheduleId: Number(id),
        schedule: {
          studentId: req.student.id
        }
      }
    });

    if (!task) {
      return res.status(404).json({
        status: 'fail',
        message: 'Task not found.'
      });
    }

    if (task.completed) {
      return res.status(400).json({
        status: 'fail',
        message: 'Completed tasks cannot be rescheduled.'
      });
    }

    const lastTask = await prisma.studyTask.findFirst({
      where: {
        scheduleId: Number(id)
      },
      orderBy: {
        day: 'desc'
      }
    });

    const newDay = (lastTask?.day || 0) + 1;

    const updatedTask = await prisma.studyTask.update({
      where: {
        id: task.id
      },
      data: {
        day: newDay,
        rescheduled: true
      }
    });

    const updatedTotalDays = Math.max(
      Number(task.day),
      newDay
    );

    await prisma.schedule.update({
      where: {
        id: Number(id)
      },
      data: {
        totalDays: updatedTotalDays
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Session rescheduled successfully.',
      data: {
        task: updatedTask
      }
    });

  } catch (error) {
    console.error('Error rescheduling session:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Failed to reschedule session.'
    });
  }
};