const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendOTP = async (email, otpCode) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("⚠️ Warning: EMAIL_USER or EMAIL_PASS is not configured. Simulating OTP send.");
    console.log(`[SIMULATION] OTP for ${email} is: ${otpCode}`);
    return;
  }

  const mailOptions = {
    from: `"CryptoVault" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your CryptoVault OTP Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #333; border-radius: 10px; background-color: #0d0d0d; color: #fff;">
        <h2 style="color: #4a90e2; text-align: center;">CryptoVault Security</h2>
        <p>You requested an OTP for a secure action in CryptoVault.</p>
        <div style="background-color: #1a1a1a; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
          <h1 style="color: #00ffcc; letter-spacing: 5px; margin: 0;">${otpCode}</h1>
        </div>
        <p>This code will expire in 5 minutes.</p>
        <p style="color: #888; font-size: 12px; margin-top: 30px; text-align: center;">If you did not request this, please ignore this email.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 OTP sent to ${email}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send OTP email');
  }
};

module.exports = {
  sendOTP
};
