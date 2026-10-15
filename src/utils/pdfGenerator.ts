/**
 * PDF Report Generator Utility for PharmaMix Lab
 * Generates Executive Summaries and Full AutoML Presentation Reports
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { AutoMLOverallSummary, AutoMLBrandResult } from '../modules/mmm-engine/automlEngine';
import { rub, pct } from './math';

export async function generateExecutiveSummaryPDF(summary: AutoMLOverallSummary): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const primaryColor = [30, 41, 59]; // slate-800
  const brandColor = [37, 99, 235]; // blue-600
  const accentColor = [16, 185, 129]; // emerald-500

  // Header banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('PHARMAMIX LAB — EXECUTIVE MARKETING SUMMARY', 14, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('ru-RU')} | Brands: ${summary.brands.join(', ')}`, 14, 22);

  // Key KPI Cards
  let y = 38;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Portfolio Key Performance Indicators', 14, y);

  y += 6;
  const portfolio = summary.allBrandsResult;

  // Draw 3 KPI boxes
  const boxes = [
    { label: 'Total Portfolio Sales', value: rub(portfolio.totalSalesRub), color: brandColor },
    { label: 'Incremental Promo Revenue', value: rub(portfolio.incrementalSalesRub), color: accentColor },
    { label: 'Best AutoML Model & ROAS', value: `${portfolio.bestModelName.slice(0, 22)}... (ROAS: ${portfolio.roas}x)`, color: primaryColor }
  ];

  boxes.forEach((box, i) => {
    const x = 14 + i * 62;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, 58, 20, 2, 2, 'FD');

    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(box.label, x + 4, y + 6);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(box.color[0], box.color[1], box.color[2]);
    doc.text(box.value, x + 4, y + 14);
  });

  // Table: Brand Leaderboard & AutoML Accuracy
  y += 28;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('2. AutoML Tournament Winners & Brand Metrics', 14, y);

  y += 6;
  // Table header
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);

  doc.text('Brand', 18, y + 5.5);
  doc.text('Sales (RUB)', 55, y + 5.5);
  doc.text('Baseline %', 92, y + 5.5);
  doc.text('Best AutoML Model', 122, y + 5.5);
  doc.text('MAPE', 168, y + 5.5);
  doc.text('ROAS', 184, y + 5.5);

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  const brandKeys = Object.keys(summary.brandResults);
  brandKeys.forEach((bKey, idx) => {
    const res = summary.brandResults[bKey];
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, 182, 7, 'F');
    }
    doc.text(res.brand, 18, y + 5);
    doc.text(rub(res.totalSalesRub), 55, y + 5);
    doc.text(`${res.baselineSharePct}%`, 92, y + 5);
    doc.text(res.bestModelName.slice(0, 26), 122, y + 5);
    doc.text(`${res.bestMape}%`, 168, y + 5);
    doc.text(`${res.roas}x`, 184, y + 5);
    y += 7;
  });

  // Section 3: Trade Marketing Mechanics Efficiency
  y += 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('3. Trade Marketing Mechanics Ranking', 14, y);

  y += 6;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 8, 'F');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  doc.text('TMA Mechanic', 18, y + 5.5);
  doc.text('Uplift %', 85, y + 5.5);
  doc.text('Bonus %', 112, y + 5.5);
  doc.text('Incremental Revenue', 135, y + 5.5);
  doc.text('ROAS', 182, y + 5.5);

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  summary.mechanicStats.forEach((m, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, 182, 7, 'F');
    }
    doc.text(m.mechanic.slice(0, 38), 18, y + 5);
    doc.text(`+${m.upliftPct}%`, 85, y + 5);
    doc.text(`${m.avgBonusPct}%`, 112, y + 5);
    doc.text(rub(m.incrementalRevenueRub), 135, y + 5);
    doc.text(`${m.roas}x`, 182, y + 5);
    y += 7;
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('PharmaMix Lab v3.1 Confidential Analytical Executive Report | Automated Econometric Platform', 14, 285);

  doc.save('PharmaMix_Executive_Summary.pdf');
}

export async function generateFullAutoMLReportPDF(elementId: string): Promise<void> {
  const elem = document.getElementById(elementId);
  if (!elem) {
    alert('Элемент отчета не найден');
    return;
  }

  const canvas = await html2canvas(elem, {
    scale: 2,
    useCORS: true,
    logging: false
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const imgWidth = 210;
  const pageHeight = 297;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft >= 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save('PharmaMix_Full_AutoML_Report.pdf');
}
