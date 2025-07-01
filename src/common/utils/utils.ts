import * as moment from 'moment';
import * as momentTimeZone from 'moment-timezone';
import { find as findTimeZone } from 'geo-tz';
import { extname } from 'path';

const DISPLAY_DATE_TIME_FORMAT_24H = 'MMM DD, YYYY, HH:mm:ss';
const DISPLAY_DATE_TIME_FORMAT_12H = 'MMM DD, YYYY, h:mm:ss A';
const DISPLAY_DATE_TIME_WITHOUT_SECOND_FORMAT_24H = 'MMM DD, YYYY, HH:mm';
const DISPLAY_DATE_TIME_WITHOUT_SECOND_FORMAT_12H = 'MMM DD, YYYY, h:mm A';

export const enumToTile = (text: string): string => {
  return text
    ?.replace(/_/g, ' ')
    ?.replace(
      /\w\S*/g,
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    ?.replace('Pm', 'PM');
};

export const decodeURL = (text: string): string => {
  return decodeURIComponent(text.split('?')[0].split('.com/').reverse()[0]);
};

export const dateToUTC = (date = null) => {
  return (date ? moment(date) : moment()).utc().toDate();
};

export const getTimeZone = (lat, lng) => {
  return findTimeZone(lat, lng)[0]; // Get timezone based on lat/lng
};

export const getTimeZoneShortForm = (timezone) => {
  return new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    timeZoneName: 'short',
  })
    .formatToParts()
    .find((part) => part.type === 'timeZoneName')?.value;
};

export const displayDate = (date) => {
  return date ? moment(date).format('MMM DD, YYYY') : '-';
};

export const displayDateWithTime = (date, use12HourFormat) => {
  return date
    ? moment(date).format(
        use12HourFormat
          ? DISPLAY_DATE_TIME_FORMAT_12H
          : DISPLAY_DATE_TIME_FORMAT_24H,
      )
    : '-';
};

export const displayDateWithTimeZone = (date, use12HourFormat, timezone) => {
  return date
    ? timezone
      ? momentTimeZone(date)
          .tz(timezone)
          .format(
            use12HourFormat
              ? DISPLAY_DATE_TIME_FORMAT_12H
              : DISPLAY_DATE_TIME_FORMAT_24H,
          )
      : moment(date).format(
          use12HourFormat
            ? DISPLAY_DATE_TIME_FORMAT_12H
            : DISPLAY_DATE_TIME_FORMAT_24H,
        )
    : '-';
};

export const displayDateWithTimeZoneWithOutSecond = (
  date,
  use12HourFormat,
  timezone,
) => {
  return date
    ? timezone
      ? momentTimeZone(date)
          .tz(timezone)
          .format(
            use12HourFormat
              ? DISPLAY_DATE_TIME_WITHOUT_SECOND_FORMAT_12H
              : DISPLAY_DATE_TIME_WITHOUT_SECOND_FORMAT_24H,
          )
      : moment(date).format(
          use12HourFormat
            ? DISPLAY_DATE_TIME_WITHOUT_SECOND_FORMAT_12H
            : DISPLAY_DATE_TIME_WITHOUT_SECOND_FORMAT_24H,
        )
    : '-';
};

export const toArray = (value: string | string[]): string[] => {
  return typeof value === 'string' ? [value] : value ?? [];
};

export const cleanHtmlTags = (text: string): string => {
  return text?.replace(/<[^>]+>/g, '');
};

export const getFileNameFromFiles = (files): string[] => {
  return files.map((file) => file.originalname);
};

export const getFileNameFromFolders = (files, folders): string[] => {
  const fileNames = [];
  Object.keys(folders).map((folder) => {
    const element = files[folders[folder]];
    if (element?.length) {
      fileNames.push(...element.map((file) => file.originalname));
    }
  });
  return fileNames;
};

export const disAllowedExtensions = (filenames: string[]) => {
  const DISALLOWED_EXTENSIONS = [
    '.exe',
    '.bat',
    '.sh',
    '.js',
    '.vbs',
    '.scr',
    '.pif',
    '.msi',
    '.com',
    '.jar',
    '.php',
    '.pl',
    '.zip',
  ];
  const disAllowedExtensions = filenames.filter((filename) => {
    const extnme = extname(filename).toLowerCase();
    return DISALLOWED_EXTENSIONS.includes(extnme);
  });

  return disAllowedExtensions;
};

// Formats the repeat frequency for a work order based on the day of the month and frequency.
const formatDateFrequency = (
  date: string | number,
  frequency: string | number,
) => {
  if (date === 1 && frequency === 1) {
    return 'This work order repeats on the first day of every month.';
  }
  if (frequency === 1) {
    return `This work order repeats on the ${date} day of every month.`;
  }
  return `This work order repeats on the ${date} day of every ${frequency} months.`;
};

// Formats the repeat frequency for a work order based on a specific day of the week and frequency.
const formatDayFrequency = (
  frequency: string | number,
  day: string | number,
  week: string | number,
) => {
  if (frequency === 1) {
    return `This work order repeats every month on ${week} ${day}.`;
  }
  return `This work order repeats every ${frequency} months on ${week}  ${day} of the month.`;
};

// Renders the work order repetition based on the frequency type (WEEKLY, MONTHLY, DAILY) and other parameters.
export const workOrderFrequencyInText = (pm) => {
  const { frequencyType, dayType, date, frequency, day, week } = pm ?? {};

  switch (frequencyType) {
    case 'WEEKLY':
      return `This work order repeats weekly every ${day}.`;

    case 'MONTHLY':
      if (dayType === 'date') {
        return formatDateFrequency(date, frequency); // Handle repeat by date.
      }
      if (dayType === 'day') {
        return formatDayFrequency(frequency, day, week); // Handle repeat by week and day.
      }
      break;

    case 'DAILY':
      return 'This work order repeats everyday.'; // Handle daily repetition.

    default:
      return null;
  }
};
