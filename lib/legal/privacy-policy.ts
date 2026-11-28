import { hospitalInfo } from "@/lib/hospital-info";
import type { LegalDocument } from "@/lib/legal/types";

// Keep this in step with what the app actually collects: profile fields
// (supabase/migrations/*profiles*), beneficiaries, notifications, and the
// processors in supabase/functions/dispatch-notifications. If you add a data
// field, a third-party service or analytics, update this page and its date.

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  lastUpdated: "November 27, 2026",
  intro: `${hospitalInfo.name} runs the FAME Hospital Booking app on iOS, Android and the web. This policy explains what information the app collects, how it is used, who can see it, and the choices you have.`,
  sections: [
    {
      heading: "Information you give us",
      blocks: [
        {
          list: [
            "Account details: your full name, email address, date of birth, gender and password. Your password is stored by our authentication provider in hashed form; hospital staff cannot see it.",
            "Profile details you choose to add: phone number, home address, emergency contact name and phone number, and a profile photo.",
            "Health details you choose to add: blood type, allergies, medications, medical conditions and medical notes.",
            "Family members you book for: their name, date of birth, gender and relationship to you.",
            "Bookings: the doctor, the clinic session you booked, and any reason or notes you write for the doctor.",
          ],
        },
      ],
    },
    {
      heading: "Information created as you use the app",
      blocks: [
        {
          list: [
            "Your appointment history, including bookings, reschedules, cancellations and whether a visit took place.",
            "Your notification preferences and, if you allow push notifications, a device token that lets us send them to your phone.",
            "A record of the notifications we send you (when, by which channel, and whether delivery succeeded).",
            "A log of actions hospital administrators take on accounts and schedules, kept for security and accountability.",
          ],
        },
        "The app does not use advertising, analytics or tracking tools, and we do not build profiles of you for marketing.",
      ],
    },
    {
      heading: "How we use your information",
      blocks: [
        {
          list: [
            "To create and secure your account and let you book, reschedule and cancel appointments.",
            "To let your doctor and hospital staff prepare for and manage your visit.",
            "To send appointment confirmations and reminders by the channels you have turned on.",
            "To keep the service working and safe, including investigating misuse.",
            "To meet our legal and medical record-keeping obligations.",
          ],
        },
        "We do not sell your information or use it for advertising.",
      ],
    },
    {
      heading: "Who can see your information",
      blocks: [
        {
          list: [
            "You can see and edit your own profile, family members and appointments.",
            "A doctor you have an appointment with can see your profile, including any health details you have added, along with the appointment and the details of the person the visit is for.",
            "Hospital administrators can see accounts, family members, appointments and whether our messages to you were delivered, so they can run schedules and help you.",
          ],
        },
        "We use these service providers to run the app. They process information only on our behalf:",
        {
          list: [
            "Supabase, which hosts our database, sign-in and file storage.",
            "Resend, which sends email notifications.",
            "Twilio, which sends SMS notifications.",
            "Expo, which delivers push notifications and app updates.",
          ],
        },
        "We may also disclose information when the law requires it, or to protect someone's life or safety.",
      ],
    },
    {
      heading: "Information stored on your device",
      blocks: [
        "To keep you signed in, the app stores a session token on your device: in the device's secure storage on iOS and Android, or in your browser's local storage on the web. It also remembers an in-progress booking and a few preferences. Signing out removes your session.",
        "If you add an appointment to your calendar, the app asks for calendar permission and creates that one event. It does not upload or read the contents of your calendar.",
      ],
    },
    {
      heading: "How we protect your information",
      blocks: [
        "Information is sent over encrypted connections. Access rules in our database limit each person to the records their role allows, and administrator actions are logged. No system is completely secure, so please use a strong password that you don't use anywhere else and tell us if you think your account has been misused.",
      ],
    },
    {
      heading: "How long we keep it",
      blocks: [
        "We keep your information while your account is active. When you delete your account, your profile, health details, family members, appointment history and notification records are deleted from the app straight away; upcoming visits are cancelled first and the doctor is told. Medical records the hospital keeps in its own systems are not part of the app and are kept as medical record-keeping rules require.",
      ],
    },
    {
      heading: "Your choices and rights",
      blocks: [
        {
          list: [
            "View and update your profile and family members at any time in the app.",
            "Choose which notifications you receive in the app, and turn off push notifications in your device settings.",
            "Delete your account at any time: in the app, open Profile and tap Delete account, or visit the Delete account page on our website (/delete-account).",
            `Ask for a copy of your information or a correction by contacting us at ${hospitalInfo.email}.`,
          ],
        },
      ],
    },
    {
      heading: "Children",
      blocks: [
        "Accounts are for adults. A parent or guardian can add a child as a family member and book visits for them; the account holder is responsible for the information they provide about the child.",
      ],
    },
    {
      heading: "Changes to this policy",
      blocks: [
        "If we change this policy, we will update the date at the top of this page. For significant changes we will also let you know in the app or by email before they take effect.",
      ],
    },
    {
      heading: "Contact us",
      blocks: [
        `Questions or requests about your privacy: email ${hospitalInfo.email} or call ${hospitalInfo.phone} (${hospitalInfo.hours}).`,
      ],
    },
  ],
};
