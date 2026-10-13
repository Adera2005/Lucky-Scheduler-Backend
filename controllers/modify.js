const prisma = require('../prisma.js');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse-fixed');
const fs = require('fs');
const path = require('path');
const { generateDailyTasks } = require('./schedulerController');

function deleteUploadedPdf(fileUrl) {
  if (!fileUrl) return;
  const filename = path.basename(fileUrl);
  const filePath = path.join(__dirname, '..', 'uploads', filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

exports.deleteSchedule = async (req, res) => {
  try {
    const scheduleId = Number(req.params.id);

    const schedule = await prisma.schedule.findFirst({
      where: {
        id: scheduleId,
        studentId: req.student.id
      }
    });

    if (!schedule) {
      return res.status(404).json({
        status: 'fail',
        message: 'Schedule not found.'
      });
    }

    await prisma.$transaction([
      prisma.studyTask.deleteMany({ where: { scheduleId } }),
      prisma.studySession.deleteMany({ where: { scheduleId } }),
      prisma.schedule.delete({ where: { id: scheduleId } })
    ]);

    deleteUploadedPdf(schedule.fileUrl);

    res.status(200).json({
      status: 'success',
      message: 'Schedule deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting schedule:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Failed to delete schedule.'
    });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    const scheduleId = Number(req.params.id);
    const { course, totalDays, studySessions, totalPages, removePdf } = req.body;

    const existing = await prisma.schedule.findFirst({
      where: {
        id: scheduleId,
        studentId: req.student.id
      }
    });

    if (!existing) {
      return res.status(404).json({
        status: 'fail',
        message: 'Schedule not found.'
      });
    }

    if (!course || !totalDays) {
      return res.status(400).json({
        status: 'fail',
        message: "Please provide 'course' and 'totalDays'."
      });
    }

    let parsedSessions = studySessions;
    if (typeof studySessions === 'string') {
      try {
        parsedSessions = JSON.parse(studySessions);
      } catch {
        parsedSessions = [{ startTime: '08:00', endTime: '10:00' }];
      }
    }

    if (!parsedSessions || parsedSessions.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide at least one study session.'
      });
    }

    let newTotalPages = existing.totalPages;
    let fileUrl = existing.fileUrl;
    let pdfText = existing.pdfText;
    const shouldRemovePdf = removePdf === 'true' || removePdf === true;

    if (req.file) {
      try {
        const pdfBytes = fs.readFileSync(req.file.path);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        newTotalPages = pdfDoc.getPageCount();

        const parsedData = await pdfParse(pdfBytes);
        pdfText = parsedData.text;

        deleteUploadedPdf(existing.fileUrl);
        fileUrl = `/uploads/${req.file.filename}`;
      } catch (pdfError) {
        console.error('PDF reading error:', pdfError.message);
        return res.status(400).json({
          status: 'fail',
          message: 'Could not read the uploaded PDF. Please try again.'
        });
      }
    } else if (shouldRemovePdf) {
      deleteUploadedPdf(existing.fileUrl);
      fileUrl = null;
      pdfText = null;
      if (!totalPages) {
        return res.status(400).json({
          status: 'fail',
          message: 'Please enter total pages after removing the PDF.'
        });
      }
      newTotalPages = Number(totalPages);
    } else if (!existing.fileUrl && totalPages) {
      newTotalPages = Number(totalPages);
    }

    if (!newTotalPages || Number.isNaN(newTotalPages) || newTotalPages < 1) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please either upload a PDF or enter the total pages manually.'
      });
    }

    const dailyTasks = generateDailyTasks(
      Number(newTotalPages),
      Number(totalDays),
      parsedSessions
    );

    const pagesPerDay = Math.ceil(Number(newTotalPages) / Number(totalDays));

    const updatedSchedule = await prisma.$transaction(async (tx) => {
      await tx.studyTask.deleteMany({ where: { scheduleId } });
      await tx.studySession.deleteMany({ where: { scheduleId } });

      return tx.schedule.update({
        where: { id: scheduleId },
        data: {
          course,
          totalPages: Number(newTotalPages),
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
    });

    res.status(200).json({
      status: 'success',
      data: {
        schedule: updatedSchedule,
        summary: `Updated ${course}: ${newTotalPages} pages over ${totalDays} days (${pagesPerDay} pages/day). Study tasks were regenerated.`
      }
    });
  } catch (error) {
    console.error('Error updating schedule:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Failed to update schedule.'
    });
  }
};
