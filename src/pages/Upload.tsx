import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  Button,
  Divider,
  Input,
  notification,
  Skeleton,
  Space,
  Switch,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import {
  PlusOutlined,
  ToolOutlined,
  FundOutlined,
  SettingOutlined,
  CopyOutlined,
  ShareAltOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { UploadRequestOption } from 'rc-upload/lib/interface';
import { UploadFile } from 'antd/lib/upload/interface';
import { useHistory } from 'react-router-dom';
import pako from 'pako';
import {
  customAlphabet,
  nanoid,
} from 'nanoid';
import {
  emailNotVerified,
  restrictedPage,
} from './auth/notifications';
import { useAuth } from '../contexts/AuthContext';
import { Routes } from '../routes';
import {
  fireStoreDoc,
  setDoc,
  getDoc,
  storage,
  storageRef,
  uploadBytesResumable,
  deleteObject,
  db,
} from '../firebase';
import useStorage from '../hooks/useStorage';

enum MaxFiles {
  TUNE_FILES = 1,
  LOG_FILES = 5,
  TOOTH_LOG_FILES = 5,
  CUSTOM_INI_FILES = 1,
}

interface TuneDbData {
  userUid?: string;
  createdAt?: Date;
  updatedAt?: Date;
  isPublished?: boolean;
  isListed?: boolean;
  isPublic?: boolean;
  tuneFile?: string | null;
  logFiles?: string[];
  toothLogFiles?: string[];
  customIniFile?: string | null;
}

type Path = string;

interface UploadedFile {
  [autoUid: string]: Path;
}

interface UploadFileData {
  path: string;
}

const containerStyle = {
  padding: 20,
  maxWidth: 600,
  margin: '0 auto',
};

const NEW_TUNE_ID_KEY = 'newTuneId';
const MAX_FILE_SIZE_MB = 10;

const tuneIcon = () => <ToolOutlined />;
const logIcon = () => <FundOutlined />;
const toothLogIcon = () => <SettingOutlined />;
const iniIcon = () => <FileTextOutlined />;

const nanoidCustom = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 10);
const baseUploadPath = 'public/users';

const UploadPage = () => {
  const [newTuneId, setNewTuneId] = useState<string>();
  const [isUserAuthorized, setIsUserAuthorized] = useState(false);
  const hasNavigatorShare = navigator.share !== undefined;
  const [shareUrl, setShareUrl] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [isListed, setIsListed] = useState(true);
  const { currentUser, refreshToken } = useAuth();
  const history = useHistory();
  const { storageSet, storageGet, storageDelete } = useStorage();
  const [tuneFile, setTuneFile] = useState<UploadedFile | null>(null);
  const [logFiles, setLogFiles] = useState<UploadedFile>({});
  const [toothLogFiles, setToothLogFiles] = useState<UploadedFile>({});
  const [customIniFile, setCustomIniFile] = useState<UploadedFile | null>(null);

  const copyToClipboard = async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    }
  };

  const genericError = (error: Error) => notification.error({ message: 'Error', description: error.message });

  const updateDbData = (tuneId: string, dbData: TuneDbData) => {
    try {
      return setDoc(fireStoreDoc(db, 'tunes', tuneId), dbData, { merge: true });
    } catch (error) {
      console.error(error);
      genericError(error as Error);
      return Promise.reject(error);
    }
  };

  const getDbData = (tuneId: string) => {
    try {
      return getDoc(fireStoreDoc(db, 'tunes', tuneId));
    } catch (error) {
      console.error(error);
      genericError(error as Error);
      return Promise.reject(error);
    }
  };

  const removeFile = (path: string) => {
    try {
      return deleteObject(storageRef(storage, path));
    } catch (error) {
      console.error(error);
      genericError(error as Error);
      return Promise.reject(error);
    }
  };

  const publish = async () => {
    setIsLoading(true);
    await updateDbData(newTuneId!, {
      updatedAt: new Date(),
      isPublished: true,
      isPublic,
      isListed,
    });
    setIsPublished(true);
    setIsLoading(false);
    storageDelete(NEW_TUNE_ID_KEY);
  };

  const upload = async (path: string, options: UploadRequestOption, done?: Function) => {
    const { onError, onSuccess, onProgress, file } = options;

    if ((file as File).size / 1024 / 1024 > MAX_FILE_SIZE_MB) {
      const errorName = 'File too large';
      const errorMessage = `File should not be larger than ${MAX_FILE_SIZE_MB}MB!`;
      notification.error({ message: errorName, description: errorMessage });
      onError!({ name: errorName, message: errorMessage });
      return false;
    }

    try {
      const buffer = await (file as File).arrayBuffer();
      const compressed = pako.deflate(new Uint8Array(buffer));
      const uploadTask = uploadBytesResumable(storageRef(storage, path), compressed, {
        customMetadata: {
          name: (file as File).name,
          size: `${(file as File).size}`,
        },
      });

      uploadTask.on(
        'state_changed',
        (snap) => onProgress!({ percent: (snap.bytesTransferred / snap.totalBytes) * 100 }),
        (err) => onError!(err),
        () => {
          onSuccess!(file);
          if (done) done();
        },
      );
    } catch (error) {
      console.error('Upload error:', error);
      notification.error({ message: 'Upload error', description: (error as Error).message });
      onError!(error as Error);
    }

    return true;
  };

  const tuneFileData = () => ({
    path: `${baseUploadPath}/${currentUser!.uid}/tunes/${newTuneId}/${nanoid()}.msq.gz`,
  });

  const logFileData = (file: UploadFile) => {
    const { name } = file;
    const extension = name.split('.').pop();
    return {
      path: `${baseUploadPath}/${currentUser!.uid}/tunes/${newTuneId}/logs/${nanoid()}.${extension}.gz`,
    };
  };

  const toothLogFilesData = () => ({
    path: `${baseUploadPath}/${currentUser!.uid}/tunes/${newTuneId}/tooth-logs/${nanoid()}.csv.gz`,
  });

  const customIniFileData = () => ({
    path: `${baseUploadPath}/${currentUser!.uid}/tunes/${newTuneId}/${nanoid()}.ini.gz`,
  });

  const uploadTune = async (options: UploadRequestOption) => {
    const found = await getDbData(newTuneId!);
    if (!found.exists()) {
      const tuneData: TuneDbData = {
        userUid: currentUser!.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublished: false,
        isPublic,
        isListed,
        tuneFile: null,
        logFiles: [],
        toothLogFiles: [],
        customIniFile: null,
      };
      await updateDbData(newTuneId!, tuneData);
    }
    setShareUrl(`https://speedytuner.cloud/#/t/${newTuneId}`);

    const { path } = (options.data as unknown as UploadFileData);
    upload(path, options, () => {
      const tune: UploadedFile = {};
      tune[(options.file as UploadFile).uid] = path;
      setTuneFile(tune);
      updateDbData(newTuneId!, { tuneFile: path });
    });
  };

  const uploadLogs = async (options: UploadRequestOption) => {
    const { path } = (options.data as unknown as UploadFileData);
    upload(path, options, async () => {
      const tune: UploadedFile = {};
      tune[(options.file as UploadFile).uid] = path;
      const newValues = { ...logFiles, ...tune };
      await updateDbData(newTuneId!, { logFiles: Object.values(newValues) });
      setLogFiles(newValues);
    });
  };

  const uploadToothLogs = async (options: UploadRequestOption) => {
    const { path } = (options.data as unknown as UploadFileData);
    upload(path, options, async () => {
      const tune: UploadedFile = {};
      tune[(options.file as UploadFile).uid] = path;
      const newValues = { ...toothLogFiles, ...tune };
      await updateDbData(newTuneId!, { toothLogFiles: Object.values(newValues) });
      setToothLogFiles(newValues);
    });
  };

  const uploadCustomIni = async (options: UploadRequestOption) => {
    const { path } = (options.data as unknown as UploadFileData);
    upload(path, options, () => {
      const tune: UploadedFile = {};
      tune[(options.file as UploadFile).uid] = path;
      setCustomIniFile(tune);
      updateDbData(newTuneId!, { customIniFile: path });
    });
  };

  const removeTuneFile = async (file: UploadFile) => {
    removeFile(tuneFile![file.uid]);
    updateDbData(newTuneId!, { tuneFile: null });
    setTuneFile(null);
  };

  const removeLogFile = async (file: UploadFile) => {
    const { uid } = file;
    removeFile(logFiles[file.uid]);
    const newValues = { ...logFiles };
    delete newValues[uid];
    updateDbData(newTuneId!, { logFiles: Object.values(newValues) });
    setLogFiles(newValues);
  };

  const removeToothLogFile = async (file: UploadFile) => {
    const { uid } = file;
    removeFile(toothLogFiles[file.uid]);
    const newValues = { ...toothLogFiles };
    delete newValues[uid];
    updateDbData(newTuneId!, { toothLogFiles: Object.values(newValues) });
    setToothLogFiles(newValues);
  };

  const removeCustomIniFile = async (file: UploadFile) => {
    removeFile(customIniFile![file.uid]);
    updateDbData(newTuneId!, { customIniFile: null });
    setCustomIniFile(null);
  };

  const prepareData = useCallback(async () => {
    if (!currentUser) {
      restrictedPage();
      history.push(Routes.LOGIN);

      return;
    }

    try {
      await refreshToken();
      if (!currentUser.emailVerified) {
        emailNotVerified();
        history.push(Routes.LOGIN);

        return;
      }
      setIsUserAuthorized(true);
    } catch (error) {
      storageDelete(NEW_TUNE_ID_KEY);
      console.error(error);
      genericError(error as Error);
    }

    let newTuneIdTemp = await storageGet(NEW_TUNE_ID_KEY);
    if (!newTuneIdTemp) {
      newTuneIdTemp = nanoidCustom();
      await storageSet(NEW_TUNE_ID_KEY, newTuneIdTemp);
    }
    setNewTuneId(newTuneIdTemp);
  }, [currentUser, history, refreshToken, storageDelete, storageGet, storageSet]);

  useEffect(() => {
    prepareData();
  }, [currentUser, history, prepareData, refreshToken]);

  const uploadButton = (
    <Space direction="vertical">
      <PlusOutlined />Upload
    </Space>
  );

  const shareSection = (
    <>
      <Divider>Publish & Share</Divider>
      <Input
        style={{ width: `calc(100% - ${hasNavigatorShare ? 160 : 128}px)` }}
        value={shareUrl!}
      />
      <Tooltip title={copied ? 'Copied!' : 'Copy URL'}>
        <Button icon={<CopyOutlined />} onClick={copyToClipboard} />
      </Tooltip>
      {hasNavigatorShare && (
        <Tooltip title="Share">
          <Button
            icon={<ShareAltOutlined />}
            onClick={() => navigator.share({ url: shareUrl! })}
          />
        </Tooltip>
      )}
      <Button
        type="primary"
        style={{ float: 'right' }}
        disabled={isPublished || isLoading}
        onClick={publish}
      >
        {isPublished && !isLoading ? 'Published' : 'Publish'}
      </Button>
    </>
  );

  const optionalSection = (
    <>
      <Divider>
        <Space>
          Upload Logs
          <Typography.Text type="secondary">(.mlg, .csv, .msl)</Typography.Text>
        </Space>
      </Divider>
      <Upload
        listType="picture-card"
        customRequest={uploadLogs}
        data={logFileData}
        onRemove={removeLogFile}
        iconRender={logIcon}
        multiple
        maxCount={MaxFiles.LOG_FILES}
        disabled={isPublished}
        accept=".mlg,.csv,.msl"
      >
        {Object.keys(logFiles).length < MaxFiles.LOG_FILES && uploadButton}
      </Upload>
      <Divider>
        <Space>
          Upload Tooth and Composite logs
          <Typography.Text type="secondary">(.csv)</Typography.Text>
        </Space>
      </Divider>
      <Upload
        listType="picture-card"
        customRequest={uploadToothLogs}
        data={toothLogFilesData}
        onRemove={removeToothLogFile}
        iconRender={toothLogIcon}
        multiple
        maxCount={MaxFiles.TOOTH_LOG_FILES}
        accept=".csv"
      >
        {Object.keys(toothLogFiles).length < MaxFiles.TOOTH_LOG_FILES && uploadButton}
      </Upload>
      <Space style={{ marginTop: 30 }}>
        Show more:
        <Switch checked={showOptions} onChange={setShowOptions} />
      </Space>
      {showOptions && <>
        <Divider>
          <Space>
            Upload Custom INI
            <Typography.Text type="secondary">(.ini)</Typography.Text>
          </Space>
        </Divider>
        <Upload
          listType="picture-card"
          customRequest={uploadCustomIni}
          data={customIniFileData}
          onRemove={removeCustomIniFile}
          iconRender={iniIcon}
          disabled={isPublished}
          accept=".ini"
        >
          {!customIniFile && uploadButton}
        </Upload>
        <Divider>
          Visibility
        </Divider>
        <Space direction="vertical" size="large">
          <Space>
            Public:<Switch disabled checked={isPublic} onChange={setIsPublic} />
          </Space>
          <Space>
            Listed:<Switch checked={isListed} onChange={setIsListed} />
          </Space>
        </Space>
      </>}
      {shareUrl && tuneFile && shareSection}
    </>
  );

  if (!isUserAuthorized) {
    return (
      <div style={containerStyle}>
        <Skeleton active />
      </div>
    );
  }

  if (isPublished) {
    return (
      <div style={containerStyle}>
        {shareSection}
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <Divider>
        <Space>
          Upload Tune
          <Typography.Text type="secondary">(.msq)</Typography.Text>
        </Space>
      </Divider>
      <Upload
        listType="picture-card"
        customRequest={uploadTune}
        data={tuneFileData}
        onRemove={removeTuneFile}
        iconRender={tuneIcon}
        disabled={isPublished}
        accept=".msq"
      >
        {!tuneFile && uploadButton}
      </Upload>
      {tuneFile && optionalSection}
    </div>
  );
};

export default UploadPage;