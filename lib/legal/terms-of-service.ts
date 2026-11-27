import { hospitalInfo } from "@/lib/hospital-info";
import type { LegalDocument } from "@/lib/legal/types";

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  lastUpdated: "November 27, 2026",
  intro: `These terms cover your use of the FAME Hospital Booking app, run by ${hospitalInfo.name}. By creating an account or using the app, you agree to them. Please also read our Privacy Policy, which explains how we handle your information.`,
  sections: [
    {
      heading: "Not for emergencies",
      blocks: [
        "Do not use this app for medical emergencies. If you or someone else needs urgent care, call your local emergency number or go to the nearest emergency department.",
        "The app is a booking tool. Nothing in it is medical advice, and booking an appointment is not a diagnosis or a promise of any particular treatment.",
      ],
    },
    {
      heading: "Your account",
      blocks: [
        {
          list: [
            "You must be an adult to create an account. You may book for family members, such as your children, only if you have the authority to act for them.",
            "Give accurate, current information, including health details, and keep it up to date.",
            "Keep your password private. You are responsible for activity on your account; tell us straight away if you think someone else has used it.",
            "Sign-up creates a patient account. Doctor and administrator access is granted only by the hospital.",
          ],
        },
      ],
    },
    {
      heading: "Booking appointments",
      blocks: [
        {
          list: [
            "Appointments depend on availability. While you complete a booking, a time slot is held for you for a short time and is released if you don't finish.",
            "Some appointments must be confirmed by the doctor or hospital before they are final; the app shows each appointment's status.",
            "The hospital may need to reschedule or cancel an appointment, for example if a doctor becomes unavailable. We will tell you as soon as we can and help you rebook.",
            "If you can't attend, please cancel or reschedule in the app as early as possible so someone else can use the slot.",
            "Telehealth visits need a working internet connection and a suitable device. Home visits need an accurate address and safe access for our staff.",
          ],
        },
      ],
    },
    {
      heading: "Fees",
      blocks: [
        "The app is free to use and does not take payments. Any charges for care are handled by the hospital outside the app.",
      ],
    },
    {
      heading: "Acceptable use",
      blocks: [
        "You agree not to:",
        {
          list: [
            "make bookings you don't intend to keep, or book under someone else's name without their authority;",
            "try to access other people's accounts or information;",
            "copy, scrape or collect data from the app by automated means;",
            "interfere with, overload or try to get around the app's security; or",
            "use the app for anything unlawful.",
          ],
        },
      ],
    },
    {
      heading: "Suspension and closing your account",
      blocks: [
        `We may suspend or deactivate an account that breaks these terms or puts patients, staff or the service at risk. You can stop using the app at any time and ask us to close your account by emailing ${hospitalInfo.email}.`,
      ],
    },
    {
      heading: "Availability and changes to the app",
      blocks: [
        "We work to keep the app available and accurate but cannot promise it will always be uninterrupted or error-free. We may update, change or withdraw features, and the app may update itself to the latest version.",
      ],
    },
    {
      heading: "Ownership",
      blocks: [
        `The app, its design and its content belong to ${hospitalInfo.name} or its licensors. You may use the app for its intended purpose only.`,
      ],
    },
    {
      heading: "Limitation of liability",
      blocks: [
        `To the extent the law allows, the app is provided "as is", and ${hospitalInfo.name} is not liable for indirect or consequential losses from using it, or for being unable to use it. Nothing in these terms limits liability that cannot legally be limited, or affects the standard of care you receive from the hospital.`,
      ],
    },
    {
      heading: "Changes to these terms",
      blocks: [
        "If we change these terms, we will update the date at the top of this page and, for significant changes, let you know in the app or by email. Continuing to use the app after changes take effect means you accept them.",
      ],
    },
    {
      heading: "Contact us",
      blocks: [
        `Questions about these terms: email ${hospitalInfo.email} or call ${hospitalInfo.phone} (${hospitalInfo.hours}).`,
      ],
    },
  ],
};
