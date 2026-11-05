/**
 * (주)에쓰엔 전사 주간업무일지 자동 통합 스크립트
 */

function aggregateWeeklyReports() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheetName = "[전사통합_대시보드]"; // 데이터가 합쳐질 대상 시트
  const targetSheet = ss.getSheetByName(targetSheetName);

  if (!targetSheet) {
    ss.toast(`'${targetSheetName}' 시트가 존재하지 않습니다. 시트 이름을 확인해주세요.`, "통합 실패");
    return;
  }

  // 통합 시트의 1행 헤더 너비를 기준으로 모든 행의 열 수를 맞춤
  const columnCount = targetSheet.getLastColumn();
  if (columnCount === 0) {
    ss.toast(`'${targetSheetName}' 시트 1행에 헤더가 없습니다.`, "통합 실패");
    return;
  }

  // 집계에서 제외할 통합/관리용 시트 이름 목록
  const excludeSheets = [targetSheetName, "대시보드_요약", "설정", "템플릿"];

  const allSheets = ss.getSheets();
  let consolidatedData = [];

  // 각 부서 시트를 순회하며 데이터 수집
  allSheets.forEach(sheet => {
    const sheetName = sheet.getName();

    // 제외할 시트가 아니면 데이터 추출
    if (!excludeSheets.includes(sheetName)) {
      const dataRange = sheet.getDataRange();
      const values = dataRange.getValues();

      // 1행(헤더)을 제외한 데이터 행 추출
      if (values.length > 1) {
        for (let i = 1; i < values.length; i++) {
          const row = values[i];

          // E열(업무 내용) 또는 B열(작성자)에 값이 입력된 유효한 행만 수집
          const author = row[1];      // B열
          const taskDetail = row[4];  // E열

          if ((author && author.toString().trim() !== "") || (taskDetail && taskDetail.toString().trim() !== "")) {
            // 필요시 A열(부서명)이 비어있다면 시트 이름으로 자동 채움
            if (!row[0] || row[0].toString().trim() === "") {
              row[0] = sheetName;
            }

            // 시트마다 열 수가 달라도 기록할 수 있도록 헤더 너비에 맞춤
            const normalizedRow = row.slice(0, columnCount);
            while (normalizedRow.length < columnCount) {
              normalizedRow.push("");
            }
            consolidatedData.push(normalizedRow);
          }
        }
      }
    }
  });

  // 기존 통합 시트의 데이터 초기화 (1행 헤더 제외)
  // 수집이 끝난 뒤에 지워서, 수집 중 오류가 나도 기존 데이터가 보존되도록 함
  const lastRow = targetSheet.getLastRow();
  if (lastRow > 1) {
    targetSheet.getRange(2, 1, lastRow - 1, columnCount).clearContent();
  }

  // 수집된 데이터를 통합 시트에 일괄 기록
  if (consolidatedData.length > 0) {
    // 데이터가 시트의 행 수를 넘으면 범위 오류가 나므로 미리 행을 추가
    const requiredRows = consolidatedData.length + 1;
    const maxRows = targetSheet.getMaxRows();
    if (maxRows < requiredRows) {
      targetSheet.insertRowsAfter(maxRows, requiredRows - maxRows);
    }

    targetSheet.getRange(2, 1, consolidatedData.length, columnCount).setValues(consolidatedData);
    SpreadsheetApp.flush();
    Logger.log(`총 ${consolidatedData.length}건의 업무 항목이 통합되었습니다.`);
    ss.toast(`총 ${consolidatedData.length}건의 업무 항목이 통합되었습니다.`, "통합 완료");
  } else {
    Logger.log("수집할 업무 데이터가 없습니다.");
    ss.toast("수집할 업무 데이터가 없습니다.", "통합 완료");
  }
}

/**
 * 메뉴바에 실행 버튼 추가
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ 업무일지 자동화')
    .addItem('전사 데이터 즉시 통합', 'aggregateWeeklyReports')
    .addToUi();
}
