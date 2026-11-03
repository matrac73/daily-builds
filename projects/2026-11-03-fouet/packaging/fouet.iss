; Inno Setup script: per-user installer for Fouet (no admin rights needed).
; Built by packaging\build.ps1, which passes /DAppVersion=x.y.z.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6C1B7E2A-4F0D-4C55-9C2B-F0E7A1D3B5C1}
AppName=Fouet
AppVersion={#AppVersion}
AppVerName=Fouet {#AppVersion}
AppPublisher=Mathieu Ract
AppPublisherURL=https://matrac73.github.io/daily-builds/projects/2026-11-03-fouet/
AppSupportURL=https://github.com/matrac73/daily-builds/tree/main/projects/2026-11-03-fouet
DefaultDirName={localappdata}\Programs\Fouet
DefaultGroupName=Fouet
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=FouetSetup
SetupIconFile=fouet.ico
UninstallDisplayIcon={app}\Fouet.exe
UninstallDisplayName=Fouet
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=force
RestartApplications=no
LicenseFile=..\LICENSE

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"

[CustomMessages]
en.AutoStart=Start Fouet with Windows
fr.AutoStart=Lancer Fouet au démarrage de Windows
en.Desktop=Create a desktop shortcut
fr.Desktop=Créer un raccourci sur le Bureau
en.Launch=Launch Fouet now
fr.Launch=Lancer Fouet maintenant

[Tasks]
Name: "autostart"; Description: "{cm:AutoStart}"
Name: "desktopicon"; Description: "{cm:Desktop}"; Flags: unchecked

[Files]
Source: "..\dist\Fouet.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Fouet"; Filename: "{app}\Fouet.exe"
Name: "{autodesktop}\Fouet"; Filename: "{app}\Fouet.exe"; Tasks: desktopicon

[Registry]
; Same value the app's "Start with Windows" menu toggles.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Fouet"; \
  ValueData: """{app}\Fouet.exe"""; Tasks: autostart; Flags: uninsdeletevalue

[Run]
Filename: "{app}\Fouet.exe"; Description: "{cm:Launch}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Fouet.exe"; Flags: runhidden; RunOnceId: "KillFouet"

[UninstallDelete]
Type: dirifempty; Name: "{app}"
