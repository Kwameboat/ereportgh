Attribute VB_Name = "UploadResults"
' =============================================================================
' Results workbook — sync to School Results API (JSON matches server ingest)
'
' SHEETS: NAMES (col A=REF), REPORT (N3 selector; H9 year, H10 term; subjects row 16+ B-G)
'
' OPTIONAL "CONFIG" sheet (recommended): B1 = full ingest URL, B2 = API key, B3 = school reference
' If CONFIG missing or cells empty → uses API_URL / API_KEY constants below.
' Optional "UPLOAD_LOG" is auto-created; each sync appends one row.
'
' EMBED IN AN EXISTING .xlsm: VBA Editor > File > Import File > this .bas
'   (or copy all code into a standard module). Add CONFIG sheet. Button → UploadResults_Click
' =============================================================================

Public Const API_URL As String = "http://localhost:4000/api/excel/ingest"
Public Const API_KEY As String = "change-me-long-random-string"

Private Const CFG_SHEET As String = "CONFIG"
Private Const CFG_URL_CELL As String = "B1"
Private Const CFG_KEY_CELL As String = "B2"
Private Const CFG_SCHOOL_REF_CELL As String = "B3"
Private Const CFG_LOGO_RANGE_CELL As String = "B4"
Private Const CFG_STUDENT_PHOTO_RANGE_CELL As String = "B5"
Private Const CFG_EXACT_PDF_CELL As String = "B6"

Private Function JsonEscape(ByVal s As String) As String
    Dim i As Long, c As String, b As String
    b = ""
    For i = 1 To Len(s)
        c = Mid$(s, i, 1)
        Select Case c
            Case "\": b = b & Chr$(92) & Chr$(92)
            Case """": b = b & Chr$(92) & Chr$(34)
            Case vbCr: b = b & "\r"
            Case vbLf: b = b & "\n"
            Case vbTab: b = b & "\t"
            Case Else
                Dim ac As Long
                ac = AscW(c)
                If ac < 32 Or ac = 127 Then
                    b = b & "\u" & Right$("0000" & Hex$(ac), 4)
                Else
                    b = b & c
                End If
        End Select
    Next i
    JsonEscape = b
End Function

Private Function NzNum(ByVal v As Variant) As String
    If IsEmpty(v) Or v = "" Then
        NzNum = "null"
    ElseIf IsNumeric(v) Then
        NzNum = Replace(CStr(v), ",", ".")
    Else
        NzNum = """" & JsonEscape(CStr(v)) & """"
    End If
End Function

Private Function NzStr(ByVal v As Variant) As String
    If IsEmpty(v) Or v = "" Then
        NzStr = "null"
    Else
        NzStr = """" & JsonEscape(CStr(v)) & """"
    End If
End Function

Private Function IsoDateSerial(ByVal v As Variant) As String
    On Error GoTo Fail
    If IsEmpty(v) Or v = "" Then
        IsoDateSerial = ""
        Exit Function
    End If
    IsoDateSerial = Format$(CDate(v), "yyyy-mm-dd")
    Exit Function
Fail:
    IsoDateSerial = ""
End Function

Private Function BuildSubjectsJson(ws As Worksheet) As String
    Dim r As Long, parts As String, subj As String
    parts = ""
    r = 16
    Do While r < 60
        subj = Trim$(CStr(ws.Cells(r, "B").Value))
        If subj = "" Then Exit Do
        If parts <> "" Then parts = parts & ","
        parts = parts & "{" & _
            """subjectName"":""" & JsonEscape(subj) & """," & _
            """classScore"":" & NzNum(ws.Cells(r, "C").Value) & "," & _
            """examScore"":" & NzNum(ws.Cells(r, "D").Value) & "," & _
            """totalScore"":" & NzNum(ws.Cells(r, "E").Value) & "," & _
            """position"":" & NzStr(ws.Cells(r, "F").Value) & "," & _
            """remark"":" & NzStr(ws.Cells(r, "G").Value) & _
            "}"
        r = r + 1
    Loop
    BuildSubjectsJson = parts
End Function

Private Function ConfigOrDefault(ByVal cellAddr As String, ByVal fallback As String) As String
    On Error GoTo UseFallback
    Dim ws As Worksheet
    Set ws = Worksheets(CFG_SHEET)
    Dim v As Variant
    v = ws.Range(cellAddr).Value
    If IsEmpty(v) Then GoTo UseFallback
    Dim s As String
    s = Trim$(CStr(v))
    If s = "" Then GoTo UseFallback
    ConfigOrDefault = s
    Exit Function
UseFallback:
    ConfigOrDefault = fallback
End Function

Private Function GetApiUrl() As String
    GetApiUrl = ConfigOrDefault(CFG_URL_CELL, API_URL)
End Function

Private Function GetApiKey() As String
    GetApiKey = ConfigOrDefault(CFG_KEY_CELL, API_KEY)
End Function

Private Function GetSchoolRef() As String
    GetSchoolRef = Trim$(ConfigOrDefault(CFG_SCHOOL_REF_CELL, ""))
End Function

Private Function GetExactPdfEnabled() As Boolean
    Dim v As String
    v = LCase$(Trim$(ConfigOrDefault(CFG_EXACT_PDF_CELL, "true")))
    GetExactPdfEnabled = (v = "1" Or v = "true" Or v = "yes" Or v = "on")
End Function

Private Function TruncMsg(ByVal s As String, ByVal maxLen As Long) As String
    If Len(s) <= maxLen Then
        TruncMsg = s
    Else
        TruncMsg = Left$(s, maxLen) & "..."
    End If
End Function

Private Function ReadBinaryFile(ByVal filePath As String) As Byte()
    Dim bytes() As Byte
    Dim f As Integer
    f = FreeFile
    Open filePath For Binary Access Read As #f
    ReDim bytes(LOF(f) - 1)
    Get #f, , bytes
    Close #f
    ReadBinaryFile = bytes
End Function

Private Function Base64EncodeBytes(ByRef arrData() As Byte) As String
    Dim objXML As Object, objNode As Object
    Set objXML = CreateObject("MSXML2.DOMDocument")
    Set objNode = objXML.createElement("b64")
    objNode.DataType = "bin.base64"
    objNode.nodeTypedValue = arrData
    Base64EncodeBytes = Replace(objNode.Text, vbLf, "")
End Function

Private Function ExportRangeToBase64(ByVal ws As Worksheet, ByVal rangeAddress As String) As String
    On Error GoTo Fail
    If Trim$(rangeAddress) = "" Then
        ExportRangeToBase64 = ""
        Exit Function
    End If
    Dim rng As Range
    Set rng = ws.Range(rangeAddress)
    rng.CopyPicture Appearance:=xlScreen, Format:=xlPicture

    Dim ch As ChartObject
    Set ch = ws.ChartObjects.Add(rng.Left, rng.Top, rng.Width, rng.Height)
    ch.Activate
    ch.Chart.Paste

    Dim tmpPath As String
    tmpPath = Environ$("TEMP") & "\report_img_" & Format$(Now, "yyyymmdd_hhnnss") & "_" & CLng(Timer * 1000) & ".png"
    ch.Chart.Export Filename:=tmpPath, FilterName:="PNG"
    ch.Delete

    Dim bytes() As Byte
    bytes = ReadBinaryFile(tmpPath)
    On Error Resume Next
    Kill tmpPath
    On Error GoTo 0
    ExportRangeToBase64 = Base64EncodeBytes(bytes)
    Exit Function
Fail:
    ExportRangeToBase64 = ""
End Function

Private Function ExportSheetPdfToBase64(ByVal ws As Worksheet) As String
    On Error GoTo Fail
    Dim tmpPath As String
    tmpPath = Environ$("TEMP") & "\report_pdf_" & Format$(Now, "yyyymmdd_hhnnss") & "_" & CLng(Timer * 1000) & ".pdf"
    ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=tmpPath, Quality:=xlQualityStandard, _
        IncludeDocProperties:=True, IgnorePrintAreas:=False, OpenAfterPublish:=False
    Dim bytes() As Byte
    bytes = ReadBinaryFile(tmpPath)
    On Error Resume Next
    Kill tmpPath
    On Error GoTo 0
    ExportSheetPdfToBase64 = Base64EncodeBytes(bytes)
    Exit Function
Fail:
    ExportSheetPdfToBase64 = ""
End Function

Private Sub AppendUploadLog(ByVal term As String, ByVal yr As String, ByVal nStudents As Long, _
    ByVal httpStatus As Long, ByVal ok As Boolean, ByVal detail As String)
    On Error Resume Next
    Dim ws As Worksheet
    Set ws = Worksheets("UPLOAD_LOG")
    If ws Is Nothing Then
        Set ws = Worksheets.Add(After:=Worksheets(Worksheets.Count))
        ws.Name = "UPLOAD_LOG"
        ws.Cells(1, 1).Resize(1, 7).Value = Array("Timestamp", "Term", "Year", "Students", "HTTP", "OK", "Detail")
    End If
    Dim r As Long
    r = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row + 1
    ws.Cells(r, 1).Value = Now
    ws.Cells(r, 2).Value = term
    ws.Cells(r, 3).Value = yr
    ws.Cells(r, 4).Value = nStudents
    ws.Cells(r, 5).Value = httpStatus
    ws.Cells(r, 6).Value = IIf(ok, "Yes", "No")
    ws.Cells(r, 7).Value = TruncMsg(detail, 500)
End Sub

Public Sub SyncToResultsPortal()
    UploadResults_Click
End Sub

Public Sub UploadResults_Click()
    Dim wsNames As Worksheet, wsRep As Worksheet
    On Error GoTo ErrHandler
    Set wsNames = Worksheets("NAMES")
    Set wsRep = Worksheets("REPORT")

    Dim lastRow As Long, r As Long, refVal As Variant
    Dim nStudents As Long
    nStudents = 0

    lastRow = wsNames.Cells(wsNames.Rows.Count, 1).End(xlUp).Row
    If lastRow < 2 Then
        MsgBox "No students on NAMES sheet.", vbExclamation
        Exit Sub
    End If

    Dim metaTerm As String, metaYear As String, metaMonth As String
    Dim schoolName As String, schoolAddr As String, examTitle As String
    schoolName = CStr(wsRep.Range("B3").Value)
    schoolAddr = CStr(wsRep.Range("B4").Value)
    examTitle = CStr(wsRep.Range("B6").Value)
    metaMonth = CStr(wsRep.Range("E10").Value)
    metaYear = Trim$(CStr(wsRep.Range("H9").Value))
    metaTerm = Trim$(CStr(wsRep.Range("H10").Value))

    If metaYear = "" Or metaTerm = "" Then
        MsgBox "Fill REPORT year (H9) and term (H10) before syncing.", vbExclamation, "Missing term/year"
        Exit Sub
    End If

    Dim apiUrl As String, apiKey As String, schoolRef As String
    apiUrl = Trim$(GetApiUrl())
    apiKey = Trim$(GetApiKey())
    schoolRef = Trim$(GetSchoolRef())
    Dim exactPdfEnabled As Boolean
    exactPdfEnabled = GetExactPdfEnabled()
    Dim logoRangeAddr As String, studentPhotoRangeAddr As String
    logoRangeAddr = Trim$(ConfigOrDefault(CFG_LOGO_RANGE_CELL, ""))
    studentPhotoRangeAddr = Trim$(ConfigOrDefault(CFG_STUDENT_PHOTO_RANGE_CELL, ""))

    Dim schoolLogoB64 As String
    schoolLogoB64 = ExportRangeToBase64(wsRep, logoRangeAddr)
    If LCase$(Left$(apiUrl, 4)) <> "http" Then
        MsgBox "Invalid API URL. Set CONFIG!" & CFG_URL_CELL & " or edit API_URL in VBA.", vbCritical
        Exit Sub
    End If
    If apiKey = "" Or apiKey = "change-me-long-random-string" Then
        If MsgBox("API key looks like a placeholder. Continue?", vbYesNo Or vbExclamation, "API key") = vbNo Then
            Exit Sub
        End If
    End If
    If schoolRef = "" Then
        If MsgBox("School reference (CONFIG!B3) is empty. Continue with legacy/global API key flow?", vbYesNo Or vbQuestion, "School reference") = vbNo Then
            Exit Sub
        End If
    End If

    Dim studentsJson As String
    studentsJson = ""

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationAutomatic

    For r = 2 To lastRow
        refVal = wsNames.Cells(r, 1).Value
        If IsEmpty(refVal) Or Trim$(CStr(refVal)) = "" Then GoTo NextStudent

        wsRep.Range("N3").Value = refVal
        On Error Resume Next
        Application.CalculateFullRebuild
        If Err.Number <> 0 Then
            Err.Clear
            Application.CalculateFull
        End If
        Err.Clear
        On Error GoTo ErrHandler

        If studentsJson <> "" Then studentsJson = studentsJson & ","

        Dim exactReportB64 As String
        exactReportB64 = ""
        If exactPdfEnabled Then
            exactReportB64 = ExportSheetPdfToBase64(wsRep)
        End If

        studentsJson = studentsJson & "{" & _
            """studentId"":" & NzStr(refVal) & "," & _
            """name"":" & NzStr(wsRep.Range("C9").Value) & "," & _
            """className"":" & NzStr(wsRep.Range("C10").Value) & "," & _
            """reportPdfBase64"":" & NzStr(exactReportB64) & "," & _
            """photoBase64"":" & NzStr(ExportRangeToBase64(wsRep, studentPhotoRangeAddr)) & "," & _
            """monthReporting"":" & NzStr(metaMonth) & "," & _
            """vacationStart"":" & NzStr(IsoDateSerial(wsRep.Range("C11").Value)) & "," & _
            """vacationEnd"":" & NzStr(IsoDateSerial(wsRep.Range("G11").Value)) & "," & _
            """noOnRoll"":" & NzNum(wsRep.Range("C26").Value) & "," & _
            """attendance"":" & NzStr(wsRep.Range("F26").Value) & "," & _
            """totalMarks"":" & NzNum(wsRep.Range("C27").Value) & "," & _
            """averageMark"":" & NzNum(wsRep.Range("F27").Value) & "," & _
            """overallPosition"":" & NzStr(wsRep.Range("J27").Value) & "," & _
            """promotionStatus"":" & NzStr(wsRep.Range("J28").Value) & "," & _
            """interest"":" & NzStr(wsRep.Range("C29").Value) & "," & _
            """attitude"":" & NzStr(wsRep.Range("C30").Value) & "," & _
            """classTeacherRemarks"":" & NzStr(wsRep.Range("C31").Value) & "," & _
            """classTeacherName"":" & NzStr(wsRep.Range("D32").Value) & "," & _
            """headteacherName"":" & NzStr(wsRep.Range("D33").Value) & "," & _
            """headteacherContact"":" & NzStr(wsRep.Range("C35").Value) & "," & _
            """classTeacherContact"":" & NzStr(wsRep.Range("C34").Value) & "," & _
            """ptaLevy"":" & NzNum(wsRep.Range("C42").Value) & "," & _
            """ptaArrears"":" & NzNum(wsRep.Range("F42").Value) & "," & _
            """ptaTotal"":" & NzNum(wsRep.Range("H42").Value) & "," & _
            """subjects"":[" & BuildSubjectsJson(wsRep) & "]" & _
            "}"
        nStudents = nStudents + 1

NextStudent:
    Next r

    Application.ScreenUpdating = True

    If nStudents = 0 Then
        MsgBox "No student references in NAMES column A.", vbExclamation
        Exit Sub
    End If

    Dim body As String
    body = "{" & _
        """school"":{" & _
            """name"":" & NzStr(schoolName) & "," & _
            """address"":" & NzStr(schoolAddr) & "," & _
            """examTitle"":" & NzStr(examTitle) & "," & _
            """logoBase64"":" & NzStr(schoolLogoB64) & _
        "}," & _
        """meta"":{" & _
            """term"":" & NzStr(metaTerm) & "," & _
            """year"":" & NzStr(metaYear) & "," & _
            """month"":" & NzStr(metaMonth) & _
        "}," & _
        """students"":[" & studentsJson & "]" & _
    "}"

    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "POST", apiUrl, False
    http.setRequestHeader "Content-Type", "application/json;charset=utf-8"
    http.setRequestHeader "X-API-Key", apiKey
    If schoolRef <> "" Then http.setRequestHeader "X-School-Ref", schoolRef
    http.send body

    Dim resp As String
    resp = http.responseText
    Dim st As Long
    st = http.Status

    If st >= 200 And st < 300 Then
        AppendUploadLog metaTerm, metaYear, nStudents, st, True, resp
        MsgBox "Sync OK — " & nStudents & " student(s)." & vbCrLf & vbCrLf & TruncMsg(resp, 800), vbInformation, "Portal sync"
    Else
        AppendUploadLog metaTerm, metaYear, nStudents, st, False, resp
        MsgBox "Sync failed (HTTP " & st & "):" & vbCrLf & TruncMsg(resp, 1200), vbCritical, "Portal sync"
    End If
    Exit Sub

ErrHandler:
    Application.ScreenUpdating = True
    MsgBox "Error: " & Err.Description, vbCritical
End Sub
